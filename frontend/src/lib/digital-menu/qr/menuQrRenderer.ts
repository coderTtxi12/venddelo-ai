import type { MenuQrConfig } from './menuQrStudio';
import { resolveMenuQrBackground } from './menuQrStudio';

export type MenuQrRenderer = {
  update: (data: string, config: MenuQrConfig) => void;
  appendTo: (container: HTMLElement) => void;
  getRawData: (extension: 'png' | 'jpeg') => Promise<Blob>;
};

export async function createMenuQrRenderer(
  data: string,
  config: MenuQrConfig,
): Promise<MenuQrRenderer> {
  const { default: QRCodeStyling } = await import('qr-code-styling');

  const qr = new QRCodeStyling(buildQrOptions(data, config));

  return {
    update(nextData, nextConfig) {
      qr.update(buildQrOptions(nextData, nextConfig));
    },
    appendTo(container) {
      container.replaceChildren();
      qr.append(container);
    },
    async getRawData(extension) {
      const blob = await qr.getRawData(extension);
      if (!blob) throw new Error('No se pudo generar la imagen del QR.');
      return blob;
    },
  };
}

function buildQrOptions(data: string, config: MenuQrConfig) {
  return {
    width: config.size,
    height: config.size,
    type: 'canvas' as const,
    data,
    margin: config.margin,
    qrOptions: {
      errorCorrectionLevel: 'H' as const,
    },
    dotsOptions: {
      type: config.dotStyle,
      color: config.dotColor,
    },
    cornersSquareOptions: {
      type: config.cornerStyle,
      color: config.cornerColor,
    },
    cornersDotOptions: {
      type: config.cornerDotStyle === 'extra-rounded' ? 'dot' : config.cornerDotStyle,
      color: config.cornerDotColor,
    },
    backgroundOptions: {
      color: resolveMenuQrBackground(config),
    },
  };
}

export async function downloadMenuQrPdf(
  blob: Blob,
  config: MenuQrConfig,
  fileName: string,
  restaurantName: string,
  menuUrl: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const dataUrl = await blobToDataUrl(blob);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const qrSizeMm = 70;
  const x = (pageWidth - qrSizeMm) / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(restaurantName, pageWidth / 2, 28, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Escanea para ver el menú', pageWidth / 2, 36, { align: 'center' });

  doc.addImage(dataUrl, 'PNG', x, 44, qrSizeMm, qrSizeMm);

  doc.setFontSize(9);
  const urlLines = doc.splitTextToSize(menuUrl, pageWidth - 40);
  doc.text(urlLines, pageWidth / 2, 44 + qrSizeMm + 10, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Prueba el QR con tu celular antes de imprimir o compartir.', pageWidth / 2, 280, {
    align: 'center',
  });

  doc.save(fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function printMenuQr(
  blob: Blob,
  restaurantName: string,
  menuUrl: string,
): Promise<void> {
  const dataUrl = await blobToDataUrl(blob);
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=640,height=800');
  if (!printWindow) {
    throw new Error('No se pudo abrir la ventana de impresión. Permite ventanas emergentes.');
  }

  printWindow.document.write(`<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>QR — ${escapeHtml(restaurantName)}</title>
    <style>
      body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; color: #0f172a; }
      h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
      p { margin: 0.35rem 0; color: #475569; font-size: 0.9rem; }
      img { width: 240px; height: 240px; margin: 1rem auto; display: block; }
      .url { font-size: 0.75rem; word-break: break-all; }
      .hint { margin-top: 1rem; font-size: 0.8rem; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(restaurantName)}</h1>
    <p>Menú digital</p>
    <img src="${dataUrl}" alt="Código QR del menú" />
    <p class="url">${escapeHtml(menuUrl)}</p>
    <p class="hint">Escanea con tu celular para verificar que funciona.</p>
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Error al leer imagen'));
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
