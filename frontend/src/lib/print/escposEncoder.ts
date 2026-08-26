import type { KitchenTicketDocument, TicketLine } from './ticketDocument';

const ESC = 0x1b;
const GS = 0x1d;

const CP1252: Record<string, number> = {
  '¡': 0xa1,
  '¢': 0xa2,
  '£': 0xa3,
  '¤': 0xa4,
  '¥': 0xa5,
  '§': 0xa7,
  '¨': 0xa8,
  '©': 0xa9,
  'ª': 0xaa,
  '«': 0xab,
  '¬': 0xac,
  '®': 0xae,
  '°': 0xb0,
  '±': 0xb1,
  '´': 0xb4,
  'µ': 0xb5,
  '¶': 0xb6,
  '·': 0xb7,
  'º': 0xba,
  '»': 0xbb,
  '¿': 0xbf,
  À: 0xc0,
  Á: 0xc1,
  Â: 0xc2,
  Ã: 0xc3,
  Ä: 0xc4,
  Å: 0xc5,
  Æ: 0xc6,
  Ç: 0xc7,
  È: 0xc8,
  É: 0xc9,
  Ê: 0xca,
  Ë: 0xcb,
  Ì: 0xcc,
  Í: 0xcd,
  Î: 0xce,
  Ï: 0xcf,
  Ñ: 0xd1,
  Ò: 0xd2,
  Ó: 0xd3,
  Ô: 0xd4,
  Õ: 0xd5,
  Ö: 0xd6,
  Ø: 0xd8,
  Ù: 0xd9,
  Ú: 0xda,
  Û: 0xdb,
  Ü: 0xdc,
  Ý: 0xdd,
  ß: 0xdf,
  à: 0xe0,
  á: 0xe1,
  â: 0xe2,
  ã: 0xe3,
  ä: 0xe4,
  å: 0xe5,
  æ: 0xe6,
  ç: 0xe7,
  è: 0xe8,
  é: 0xe9,
  ê: 0xea,
  ë: 0xeb,
  ì: 0xec,
  í: 0xed,
  î: 0xee,
  ï: 0xef,
  ñ: 0xf1,
  ò: 0xf2,
  ó: 0xf3,
  ô: 0xf4,
  õ: 0xf5,
  ö: 0xf6,
  ø: 0xf8,
  ù: 0xf9,
  ú: 0xfa,
  û: 0xfb,
  ü: 0xfc,
  ý: 0xfd,
  ÿ: 0xff,
  '€': 0x80,
};

function charsForWidth(paperWidthMm: 58 | 80): number {
  return paperWidthMm === 58 ? 32 : 48;
}

function encodeText(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 128) {
      bytes.push(code);
      continue;
    }
    bytes.push(CP1252[char] ?? 0x3f);
  }
  return bytes;
}

function padKv(label: string, value: string, width: number): string {
  const left = `${label}:`;
  const space = width - left.length - value.length;
  if (space >= 1) return `${left}${' '.repeat(space)}${value}`;
  return `${left} ${value}`;
}

function wrapWords(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }
    if (current) rows.push(current);
    if (word.length <= width) {
      current = word;
    } else {
      for (let i = 0; i < word.length; i += width) {
        rows.push(word.slice(i, i + width));
      }
      current = '';
    }
  }
  if (current) rows.push(current);
  return rows.length > 0 ? rows : [''];
}

function alignBits(align: 'left' | 'center' | 'right'): number {
  if (align === 'center') return 1;
  if (align === 'right') return 2;
  return 0;
}

function lineToRows(line: TicketLine, width: number): Array<{ text: string; align: 'left' | 'center' | 'right'; bold?: boolean }> {
  switch (line.kind) {
    case 'brand':
      return [{ text: line.text.toUpperCase(), align: 'center', bold: true }];
    case 'muted':
      return wrapWords(line.text, width).map((text) => ({ text, align: 'center' as const }));
    case 'rule':
      return [{ text: '-'.repeat(width), align: 'left' }];
    case 'kv':
      return wrapWords(padKv(line.label, line.value, width), width).map((text) => ({
        text,
        align: 'left' as const,
      }));
    case 'title':
      return [{ text: line.text.toUpperCase(), align: 'left', bold: true }];
    case 'item': {
      const qtyName = `${line.qty}× ${line.name}`;
      const space = width - qtyName.length - line.price.length;
      const text =
        space >= 1 ? `${qtyName}${' '.repeat(space)}${line.price}` : `${qtyName}\n${line.price}`;
      return wrapWords(text, width).map((row) => ({ text: row, align: 'left' as const }));
    }
    case 'option':
      return wrapWords(`  ${line.text}`, width).map((text) => ({ text, align: 'left' as const }));
    case 'total': {
      const label = line.strong ? line.label.toUpperCase() : line.label;
      return [{ text: padKv(label, line.value, width), align: 'left', bold: line.strong }];
    }
    case 'center':
      return wrapWords(line.text, width).map((text) => ({ text, align: 'center' as const }));
  }
}

export function encodeKitchenTicketEscPos(doc: KitchenTicketDocument): Uint8Array {
  const width = charsForWidth(doc.paperWidthMm);
  const out: number[] = [ESC, 0x40, ESC, 0x74, 16];

  function writeRow(text: string, align: 'left' | 'center' | 'right', bold?: boolean) {
    out.push(ESC, 0x61, alignBits(align));
    if (bold) out.push(ESC, 0x45, 1);
    out.push(...encodeText(text), 0x0a);
    if (bold) out.push(ESC, 0x45, 0);
  }

  if (doc.brandName && !doc.lines.some((line) => line.kind === 'brand')) {
    writeRow(doc.brandName.toUpperCase(), 'center', true);
  }

  for (const line of doc.lines) {
    for (const row of lineToRows(line, width)) {
      writeRow(row.text, row.align, row.bold);
    }
  }

  out.push(0x0a, 0x0a, GS, 0x56, 0x00);
  return new Uint8Array(out);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function lineToHtml(line: TicketLine): string {
  switch (line.kind) {
    case 'brand':
      return `<p class="brand">${escapeHtml(line.text)}</p>`;
    case 'muted':
      return `<p class="muted">${escapeHtml(line.text)}</p>`;
    case 'rule':
      return `<hr />`;
    case 'kv':
      return `<p class="kv"><span>${escapeHtml(line.label)}</span><span>${escapeHtml(line.value)}</span></p>`;
    case 'title':
      return `<p class="title">${escapeHtml(line.text)}</p>`;
    case 'item':
      return `<p class="item"><span>${escapeHtml(String(line.qty))}× ${escapeHtml(line.name)}</span><span>${escapeHtml(line.price)}</span></p>`;
    case 'option':
      return `<p class="option">${escapeHtml(line.text)}</p>`;
    case 'total':
      return `<p class="total${line.strong ? ' strong' : ''}"><span>${escapeHtml(line.label)}</span><span>${escapeHtml(line.value)}</span></p>`;
    case 'center':
      return `<p class="center">${escapeHtml(line.text)}</p>`;
  }
}

export function kitchenTicketHtml(doc: KitchenTicketDocument): string {
  const width = doc.paperWidthMm;
  const logo = doc.logoUrl
    ? `<img class="logo" src="${escapeHtml(doc.logoUrl)}" alt="${escapeHtml(doc.brandName)}" />`
    : '';
  const body = doc.lines.map(lineToHtml).join('\n');
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Ticket ${escapeHtml(doc.brandName)}</title>
    <style>
      @page { size: ${width}mm auto; margin: 3mm; }
      html, body { margin: 0; padding: 0; background: #fff; color: #111; }
      body { width: ${width - 6}mm; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 1.35; }
      .logo { display: block; max-width: 42mm; max-height: 22mm; margin: 0 auto 4px; object-fit: contain; }
      .brand { margin: 0 0 2px; text-align: center; font-size: 14px; font-weight: 800; text-transform: uppercase; }
      .muted, .center { margin: 0 0 2px; text-align: center; }
      .muted { color: #333; font-size: 10px; }
      hr { border: 0; border-top: 1px dashed #111; margin: 6px 0; }
      .kv, .item, .total { display: flex; justify-content: space-between; gap: 8px; margin: 0 0 2px; }
      .title { margin: 0 0 4px; font-weight: 800; text-transform: uppercase; font-size: 10px; }
      .option { margin: 0 0 2px 8px; font-size: 10px; }
      .strong { font-weight: 800; font-size: 12px; }
    </style>
  </head>
  <body>
    ${logo}
    ${body}
  </body>
</html>`;
}
