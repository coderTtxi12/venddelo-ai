export type ConvertToWebpOptions = {
  /** 0–1. Default 0.92 — alta calidad visual con buena compresión. */
  quality?: number;
  /** Si el archivo ya es WebP, no reconvertir. Default true. */
  skipIfWebp?: boolean;
};

const DEFAULT_QUALITY = 0.92;

function webpFileName(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, '') || 'image';
  return `${base}.webp`;
}

function loadImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      createImageBitmap(img).then(resolve, reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });
}

/**
 * Convierte una imagen del navegador a WebP antes de subirla al backend.
 * Preserva dimensiones originales; solo cambia el formato y comprime con calidad alta.
 *
 * Formatos que no se rasterizan (p. ej. SVG) se devuelven sin cambios.
 */
export async function convertImageToWebp(
  file: File,
  options: ConvertToWebpOptions = {},
): Promise<File> {
  const quality = options.quality ?? DEFAULT_QUALITY;
  const skipIfWebp = options.skipIfWebp ?? true;

  if (!file.type.startsWith('image/')) {
    return file;
  }

  if (skipIfWebp && file.type === 'image/webp') {
    return file;
  }

  // SVG u otros vectoriales: mantener original
  if (file.type === 'image/svg+xml') {
    return file;
  }

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await loadImageBitmap(file);

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }

    ctx.drawImage(bitmap, 0, 0);

    const blob = await canvasToWebpBlob(canvas, quality);
    if (!blob || blob.type !== 'image/webp') {
      // Navegador sin soporte WebP en canvas — subir original
      return file;
    }

    return new File([blob], webpFileName(file.name), {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('[convertImageToWebp] fallback to original file', error);
    return file;
  } finally {
    bitmap?.close();
  }
}

/**
 * Prepara un archivo de imagen para upload: convierte a WebP con calidad alta.
 * Punto de entrada único para categorías, productos, logo, etc.
 */
export async function prepareImageForUpload(
  file: File,
  options?: ConvertToWebpOptions,
): Promise<File> {
  return convertImageToWebp(file, options);
}
