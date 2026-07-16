import { memo, type ReactNode } from 'react';
import { parseBlocks } from '@/components/assistant/chatMarkdownParser';
import { enrichPlainText } from '@/components/assistant/chatPlainText';
import { ChatMessageLink } from '@/components/assistant/chatMessageLink';
import styles from './ChatMarkdown.module.css';

type ChatMarkdownProps = {
  content: string;
  className?: string;
};

function appendPlainText(nodes: ReactNode[], text: string, keyPrefix: string): void {
  const enriched = enrichPlainText(text, keyPrefix, styles.colorSwatch);
  nodes.push(...enriched);
}

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern =
    /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendPlainText(nodes, text.slice(lastIndex, match.index), `${keyPrefix}-plain-${partIndex}`);
      partIndex += 1;
    }

    const token = match[0];
    const key = `${keyPrefix}-${partIndex}`;
    partIndex += 1;

    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <ChatMessageLink key={key} href={linkMatch[2]}>
            {linkMatch[1]}
          </ChatMessageLink>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    appendPlainText(nodes, text.slice(lastIndex), `${keyPrefix}-plain-${partIndex}`);
  }

  return nodes.length > 0 ? nodes : [text];
}

function renderParagraph(text: string, key: string): ReactNode {
  const lines = text.split('\n');
  return (
    <p key={key}>
      {lines.map((line, lineIndex) => (
        <span key={`${key}-line-${lineIndex}`}>
          {lineIndex > 0 ? <br /> : null}
          {parseInline(line, `${key}-inline-${lineIndex}`)}
        </span>
      ))}
    </p>
  );
}

function renderHeading(level: number, text: string, key: string): ReactNode {
  const clampedLevel = Math.min(Math.max(level, 1), 6);
  const children = parseInline(text, `${key}-inline`);

  switch (clampedLevel) {
    case 1:
      return <h1 key={key}>{children}</h1>;
    case 2:
      return <h2 key={key}>{children}</h2>;
    case 3:
      return <h3 key={key}>{children}</h3>;
    case 4:
      return <h4 key={key}>{children}</h4>;
    case 5:
      return <h5 key={key}>{children}</h5>;
    default:
      return <h6 key={key}>{children}</h6>;
  }
}

function renderBlockquote(lines: string[], key: string): ReactNode {
  return (
    <blockquote key={key}>
      {lines.map((line, lineIndex) => (
        <span key={`${key}-line-${lineIndex}`}>
          {lineIndex > 0 ? <br /> : null}
          {parseInline(line, `${key}-inline-${lineIndex}`)}
        </span>
      ))}
    </blockquote>
  );
}

function renderTable(headers: string[], rows: string[][], key: string): ReactNode {
  return (
    <div key={key} className={styles.tableWrapper}>
      <table>
        <thead>
          <tr>
            {headers.map((header, headerIndex) => (
              <th key={`${key}-th-${headerIndex}`}>
                {parseInline(header, `${key}-th-${headerIndex}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${key}-tr-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${key}-td-${rowIndex}-${cellIndex}`}>
                  {parseInline(cell, `${key}-td-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  const blocks = parseBlocks(content);
  const rootClassName = className ? `${styles.markdown} ${className}` : styles.markdown;

  return (
    <div className={rootClassName}>
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;

        if (block.type === 'heading') {
          return renderHeading(block.level, block.text, key);
        }

        if (block.type === 'blockquote') {
          return renderBlockquote(block.lines, key);
        }

        if (block.type === 'ul') {
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-item-${itemIndex}`}>
                  {parseInline(item, `${key}-item-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-item-${itemIndex}`}>
                  {parseInline(item, `${key}-item-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'table') {
          return renderTable(block.headers, block.rows, key);
        }

        return renderParagraph(block.text, key);
      })}
    </div>
  );
}

export default memo(ChatMarkdown);
