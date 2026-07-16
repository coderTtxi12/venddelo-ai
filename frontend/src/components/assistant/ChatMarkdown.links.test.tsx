import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import ChatMarkdown from './ChatMarkdown.tsx';

test('ChatMarkdown markdown links open in a new tab', () => {
  const html = renderToStaticMarkup(
    <ChatMarkdown content="[Ver menú](https://tacos.localhost:3000)" />,
  );
  assert.match(html, /href="https:\/\/tacos\.localhost:3000"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('ChatMarkdown autolinks bare URLs in a new tab', () => {
  const html = renderToStaticMarkup(
    <ChatMarkdown content="Tu menú: https://tacos.localhost:3000" />,
  );
  assert.match(html, /href="https:\/\/tacos\.localhost:3000"/);
  assert.match(html, /target="_blank"/);
});

test('ChatMarkdown renders inline color swatches for hex tokens', () => {
  const html = renderToStaticMarkup(
    <ChatMarkdown content="- **Primary:** #4F46E5\n- **Accent:** #06C167" />,
  );
  assert.match(html, /chatColorSwatchDot/);
  assert.match(html, /#4F46E5/);
  assert.match(html, /#06C167/);
});
