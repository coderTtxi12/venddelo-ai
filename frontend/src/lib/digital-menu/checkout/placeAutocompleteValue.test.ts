import assert from 'node:assert/strict';
import test from 'node:test';

import { writePlaceAutocompleteValue } from './placeAutocompleteValue.ts';

test('writePlaceAutocompleteValue sets the widget value to the formatted address', () => {
  const element = { value: '' };
  writePlaceAutocompleteValue(element, '  Reforma 123, Centro, CDMX  ');
  assert.equal(element.value, 'Reforma 123, Centro, CDMX');
});

test('writePlaceAutocompleteValue syncs a lagging shadow input', () => {
  const input = { value: '' };
  const element = {
    value: '',
    shadowRoot: {
      querySelector(selector: string) {
        return selector === 'input' ? input : null;
      },
    },
  };
  writePlaceAutocompleteValue(element, 'Calle 8, Colonia Roma');
  assert.equal(element.value, 'Calle 8, Colonia Roma');
  assert.equal(input.value, 'Calle 8, Colonia Roma');
});

test('writePlaceAutocompleteValue ignores blank address', () => {
  const element = { value: 'keep-me' };
  writePlaceAutocompleteValue(element, '   ');
  assert.equal(element.value, 'keep-me');
});
