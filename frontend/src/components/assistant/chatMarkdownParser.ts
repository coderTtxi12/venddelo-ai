export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'blockquote'; lines: string[] };

const UL_LINE = /^[-*+•·]\s+/;
const OL_LINE = /^\d+\.\s+/;

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function isBlockquoteLine(line: string): boolean {
  return /^>\s?/.test(line);
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

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !isHeadingLine(lines[index] ?? '') &&
      !isBlockquoteLine(lines[index] ?? '') &&
      !UL_LINE.test(lines[index] ?? '') &&
      !OL_LINE.test(lines[index] ?? '')
    ) {
      paragraphLines.push(lines[index] ?? '');
      index += 1;
    }

    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
  }

  return blocks;
}
