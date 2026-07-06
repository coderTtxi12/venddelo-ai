export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

const UL_LINE = /^[-*+•·]\s+/;
const OL_LINE = /^\d+\.\s+/;
const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/;

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function isBlockquoteLine(line: string): boolean {
  return /^>\s?/.test(line);
}

export function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.split('|').map((cell) => cell.trim());
}

export function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return false;
  }
  return parseTableRow(trimmed).length >= 2;
}

export function isTableSeparatorRow(line: string): boolean {
  return TABLE_SEPARATOR.test(line.trim());
}

export function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1]?.length ?? 1,
        text: headingMatch[2] ?? '',
      });
      index += 1;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isBlockquoteLine(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    if (UL_LINE.test(line)) {
      const items: string[] = [];
      while (index < lines.length && UL_LINE.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(UL_LINE, ''));
        index += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (OL_LINE.test(line)) {
      const items: string[] = [];
      while (index < lines.length && OL_LINE.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const nextLine = lines[index + 1] ?? '';
    if (
      isTableRow(line) &&
      isTableSeparatorRow(nextLine)
    ) {
      const headers = parseTableRow(line);
      index += 2;

      const rows: string[][] = [];
      while (
        index < lines.length &&
        isTableRow(lines[index] ?? '') &&
        !isTableSeparatorRow(lines[index] ?? '')
      ) {
        rows.push(parseTableRow(lines[index] ?? ''));
        index += 1;
      }

      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !isHeadingLine(lines[index] ?? '') &&
      !isBlockquoteLine(lines[index] ?? '') &&
      !UL_LINE.test(lines[index] ?? '') &&
      !OL_LINE.test(lines[index] ?? '') &&
      !(
        isTableRow(lines[index] ?? '') &&
        isTableSeparatorRow(lines[index + 1] ?? '')
      )
    ) {
      paragraphLines.push(lines[index] ?? '');
      index += 1;
    }

    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
  }

  return blocks;
}
