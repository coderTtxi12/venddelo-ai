import type { KitchenTicketDocument, TicketLine } from './ticketDocument';

const ESC = 0x1b;
const GS = 0x1d;

/** IBM PC850 (ESC t 2). Xprinter treats page 16 as a DBCS table, so CP1252 garbles á/é/í. */
const CP850: Record<string, number> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  å: 0x86,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  ì: 0x8d,
  Ä: 0x8e,
  Å: 0x8f,
  É: 0x90,
  æ: 0x91,
  Æ: 0x92,
  ô: 0x93,
  ö: 0x94,
  ò: 0x95,
  û: 0x96,
  ù: 0x97,
  ÿ: 0x98,
  Ö: 0x99,
  Ü: 0x9a,
  ø: 0x9b,
  '£': 0x9c,
  Ø: 0x9d,
  á: 0xa0,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  ª: 0xa6,
  º: 0xa7,
  '¿': 0xa8,
  '¡': 0xad,
  Á: 0xb5,
  Â: 0xb6,
  À: 0xb7,
  ã: 0xc6,
  Ã: 0xc7,
  Í: 0xd6,
  Î: 0xd7,
  Ï: 0xd8,
  Ó: 0xe0,
  ß: 0xe1,
  Ô: 0xe2,
  Ò: 0xe3,
  õ: 0xe4,
  Õ: 0xe5,
  µ: 0xe6,
  Ú: 0xe9,
  Û: 0xea,
  Ù: 0xeb,
  ý: 0xec,
  Ý: 0xed,
  '´': 0xef,
  '°': 0xf8,
  '×': 0x78,
  '€': 0xee,
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
