import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeleteConfirmCopy } from './deleteConfirmCopy';

test('product confirm copy names the product and warns irreversible', () => {
  const copy = buildDeleteConfirmCopy({ kind: 'product', name: 'Tacos al Pastor' });
  assert.equal(copy.title, '¿Eliminar «Tacos al Pastor»?');
  assert.match(copy.description, /no se puede deshacer/i);
  assert.equal(copy.confirmLabel, 'Eliminar');
  assert.equal(copy.cancelLabel, 'Cancelar');
});

test('category confirm copy requires an explicit linked product count', () => {
  // @ts-expect-error Categories must provide an accurate count before confirmation.
  buildDeleteConfirmCopy({ kind: 'category', name: 'Bebidas' });
});

test('empty category confirm copy warns irreversible without product count', () => {
  const copy = buildDeleteConfirmCopy({
    kind: 'category',
    name: 'Bebidas',
    linkedProductCount: 0,
  });
  assert.equal(copy.title, '¿Eliminar «Bebidas»?');
  assert.match(copy.description, /no se puede deshacer/i);
  assert.doesNotMatch(copy.description, /vinculados/i);
});

test('category with linked products includes count warning', () => {
  const copy = buildDeleteConfirmCopy({
    kind: 'category',
    name: 'Bebidas',
    linkedProductCount: 3,
  });
  assert.match(
    copy.description,
    /Esta categoría tiene 3 productos vinculados\. Se eliminará de todas formas\./,
  );
  assert.match(copy.description, /no se puede deshacer/i);
});

test('category with one linked product uses singular wording', () => {
  const copy = buildDeleteConfirmCopy({
    kind: 'category',
    name: 'Bebidas',
    linkedProductCount: 1,
  });
  assert.match(
    copy.description,
    /Esta categoría tiene 1 producto vinculado\. Se eliminará de todas formas\./,
  );
});
