import assert from 'node:assert/strict';
import test from 'node:test';

import { parseBlocks } from './chatMarkdownParser.ts';

test('parseBlocks renders product detail markdown structure', () => {
  const content = `### Detalles de **BURGER & BONELESS**

• **Descripción:** Bisfale sandwich, 150 g de boneless y ZUU a de papas tritas.
• **Precio base:** $259.00 MXN
### Opciones (complementos)
1) **Elige tus complementos** _(obligatorio · elige entre 1 y 2)_
- Cebolla (+$0.00)
- Cilantro (+$0.00)
- Sprite (+$20.00)

2) **Elige tu salsa** _(obligatorio · elige 1)_
- BBQ (+$0.00)
- Habanero (+$0.00)

> Nota: También hay grupos duplicados en el catálogo marcados como **no activos**; en el menú solo se muestran los **activos**.`;

  const blocks = parseBlocks(content);

  assert.equal(blocks[0]?.type, 'heading');
  assert.equal(blocks[0]?.type === 'heading' ? blocks[0].level : null, 3);
  assert.equal(
    blocks[0]?.type === 'heading' ? blocks[0].text : null,
    'Detalles de **BURGER & BONELESS**',
  );

  assert.equal(blocks[1]?.type, 'ul');
  assert.deepEqual(blocks[1]?.type === 'ul' ? blocks[1].items : null, [
    '**Descripción:** Bisfale sandwich, 150 g de boneless y ZUU a de papas tritas.',
    '**Precio base:** $259.00 MXN',
  ]);

  assert.equal(blocks[2]?.type, 'heading');
  assert.equal(
    blocks[2]?.type === 'heading' ? blocks[2].text : null,
    'Opciones (complementos)',
  );

  assert.equal(blocks[3]?.type, 'paragraph');
  assert.equal(
    blocks[3]?.type === 'paragraph' ? blocks[3].text : null,
    '1) **Elige tus complementos** _(obligatorio · elige entre 1 y 2)_',
  );

  assert.equal(blocks[4]?.type, 'ul');
  assert.deepEqual(blocks[4]?.type === 'ul' ? blocks[4].items.length : null, 3);

  assert.equal(blocks[5]?.type, 'paragraph');
  assert.match(
    blocks[5]?.type === 'paragraph' ? blocks[5].text : '',
    /^2\) \*\*Elige tu salsa\*\*/,
  );

  assert.equal(blocks[blocks.length - 1]?.type, 'blockquote');
});

test('parseBlocks renders markdown tables', () => {
  const content = `Tabla de productos en el menú en vivo (activos):

| Producto | Precio |
|---|---|
| BURGER & BONELESS | $100.00 MXN |
| BONELESS & FRIES WITC SAUCE | $229.00 MXN |
| WINGS & FRIES | $244.00 MXN |

¿Quieres que lo exporte a CSV?`;

  const blocks = parseBlocks(content);

  assert.equal(blocks[0]?.type, 'paragraph');
  assert.equal(
    blocks[0]?.type === 'paragraph' ? blocks[0].text : null,
    'Tabla de productos en el menú en vivo (activos):',
  );

  assert.equal(blocks[1]?.type, 'table');
  assert.deepEqual(
    blocks[1]?.type === 'table' ? blocks[1].headers : null,
    ['Producto', 'Precio'],
  );
  assert.deepEqual(blocks[1]?.type === 'table' ? blocks[1].rows : null, [
    ['BURGER & BONELESS', '$100.00 MXN'],
    ['BONELESS & FRIES WITC SAUCE', '$229.00 MXN'],
    ['WINGS & FRIES', '$244.00 MXN'],
  ]);

  assert.equal(blocks[2]?.type, 'paragraph');
  assert.equal(
    blocks[2]?.type === 'paragraph' ? blocks[2].text : null,
    '¿Quieres que lo exporte a CSV?',
  );
});
