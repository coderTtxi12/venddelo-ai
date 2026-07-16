import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { enrichPlainText } from './chatPlainText.tsx';
import { linkifyPlainText } from './chatInlineText.tsx';

test('enrichPlainText wraps bare https URLs', () => {
  const html = renderToStaticMarkup(
    <>{enrichPlainText('Mira tu menú: https://tacos.localhost:3000', 't')}</>,
  );
  assert.match(html, /<a href="https:\/\/tacos\.localhost:3000"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('enrichPlainText renders hex colors with swatch', () => {
  const html = renderToStaticMarkup(
    <>{enrichPlainText('Primary #06C167 y fondo #FFFFFF', 't')}</>,
  );
  assert.match(html, /chatColorSwatchDot/);
  assert.match(html, /#06C167/);
  assert.match(html, /#FFFFFF/);
  assert.match(html, /background:\s*#06C167/);
});

test('linkifyPlainText keeps trailing punctuation outside the link', () => {
  const html = renderToStaticMarkup(
    <>{linkifyPlainText('Visita https://tacos.localhost:3000.', 't')}</>,
  );
  assert.match(html, /href="https:\/\/tacos\.localhost:3000"/);
  assert.match(html, /3000<\/a>\./);
});

test('linkifyPlainText supports www links', () => {
  const html = renderToStaticMarkup(
    <>{linkifyPlainText('www.ejemplo.com/menu', 't')}</>,
  );
  assert.match(html, /<a href="https:\/\/www\.ejemplo\.com\/menu"/);
});
