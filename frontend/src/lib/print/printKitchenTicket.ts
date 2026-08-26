import type { Order, Product } from '@/lib/api/types';
import { printKitchenNetworkTicket, printKitchenSystemTicket } from '@/lib/api/restaurants';
import { buildKitchenTicketDocument, type KitchenTicketDocument } from './ticketDocument';
import { encodeKitchenTicketEscPos, kitchenTicketHtml } from './escposEncoder';
import {
  CLASSIC_BLUETOOTH_FALLBACK,
  hasDefaultKitchenPrinter,
  readKitchenPrinterPreference,
  sendEscPosToKitchenPrinter,
} from './kitchenPrinterDevice';
import {
  normalizeTicketPrintSettings,
  shouldPrintKitchenTicket,
  type KitchenTicketPrintTrigger,
  type TicketPrintSettings,
} from './ticketSettings';

export type PrintKitchenTicketResult =
  | { status: 'printed'; method: 'usb' | 'serial' | 'system' | 'bluetooth' | 'network' }
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function printHtmlCopies(html: string, copies: number): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    throw new Error('No se pudo preparar la impresión.');
  }
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  const run = () => {
    for (let i = 0; i < copies; i += 1) {
      frameWindow.focus();
      frameWindow.print();
    }
    window.setTimeout(() => iframe.remove(), 1500);
  };
  if (frameDocument.readyState === 'complete') {
    run();
    return;
  }
  iframe.addEventListener('load', run, { once: true });
}

export async function printKitchenTicketDocument(
  restaurantId: string,
  doc: KitchenTicketDocument,
  options?: { accessToken?: string | null },
): Promise<PrintKitchenTicketResult> {
  const preference = readKitchenPrinterPreference(restaurantId);
  const copies = Math.max(1, doc.copies);
  if (preference.kind === 'none') {
    return { status: 'failed', error: 'Elige una impresora predeterminada.' };
  }
  if (preference.kind === 'network') {
    if (!options?.accessToken) {
      return { status: 'failed', error: 'Inicia sesión para imprimir por Wi‑Fi o Ethernet.' };
    }
    if (!preference.host) {
      return { status: 'failed', error: 'Elige una impresora de red.' };
    }
    try {
      const payload = encodeKitchenTicketEscPos(doc);
      for (let i = 0; i < copies; i += 1) {
        await printKitchenNetworkTicket(options.accessToken, restaurantId, {
          host: preference.host,
          port: preference.port ?? 9100,
          payload_base64: bytesToBase64(payload),
        });
      }
      return { status: 'printed', method: 'network' };
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'No se pudo imprimir en la impresora de red.',
      };
    }
  }
  if (preference.kind === 'system' && preference.systemPrinterName) {
    if (!options?.accessToken) {
      return { status: 'failed', error: 'Inicia sesión para imprimir en la impresora del sistema.' };
    }
    try {
      const payload = encodeKitchenTicketEscPos(doc);
      for (let i = 0; i < copies; i += 1) {
        await printKitchenSystemTicket(options.accessToken, restaurantId, {
          printer_name: preference.systemPrinterName,
          payload_base64: bytesToBase64(payload),
        });
      }
      return { status: 'printed', method: 'system' };
    } catch (error) {
      return {
        status: 'failed',
        error:
          error instanceof Error ? error.message : 'No se pudo imprimir en la impresora del sistema.',
      };
    }
  }
  if (preference.kind === 'usb' || preference.kind === 'serial' || preference.kind === 'bluetooth') {
    try {
      const payload = encodeKitchenTicketEscPos(doc);
      for (let i = 0; i < copies; i += 1) {
        await sendEscPosToKitchenPrinter(restaurantId, payload);
      }
      return { status: 'printed', method: preference.kind };
    } catch (error) {
      if (error instanceof Error && error.message === CLASSIC_BLUETOOTH_FALLBACK) {
        try {
          printHtmlCopies(kitchenTicketHtml(doc), 1);
          return { status: 'printed', method: 'system' };
        } catch (fallbackError) {
          return {
            status: 'failed',
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : 'No se pudo imprimir el ticket.',
          };
        }
      }
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'No se pudo imprimir en la impresora predeterminada.',
      };
    }
  }

  try {
    printHtmlCopies(kitchenTicketHtml(doc), 1);
    return { status: 'printed', method: 'system' };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'No se pudo imprimir el ticket.',
    };
  }
}

export async function printKitchenOrderTicket(opts: {
  restaurantId: string;
  order: Order;
  settings: TicketPrintSettings;
  restaurantName: string;
  restaurantAddress?: string | null;
  logoUrl?: string | null;
  productsById?: ReadonlyMap<string, Product>;
  trigger?: KitchenTicketPrintTrigger | 'manual';
  accessToken?: string | null;
}): Promise<PrintKitchenTicketResult> {
  const settings = normalizeTicketPrintSettings(opts.settings);
  if (opts.trigger && opts.trigger !== 'manual') {
    if (
      !shouldPrintKitchenTicket({
        enabled: settings.enabled,
        hasDefaultPrinter: hasDefaultKitchenPrinter(readKitchenPrinterPreference(opts.restaurantId)),
        orderType: opts.order.type,
        trigger: opts.trigger,
      })
    ) {
      return { status: 'skipped' };
    }
  }

  const doc = buildKitchenTicketDocument({
    order: opts.order,
    settings,
    restaurantName: opts.restaurantName,
    restaurantAddress: opts.restaurantAddress,
    logoUrl: opts.logoUrl,
    productsById: opts.productsById,
  });
  return printKitchenTicketDocument(opts.restaurantId, doc, { accessToken: opts.accessToken });
}
