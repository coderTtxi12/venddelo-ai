import assert from 'node:assert/strict';
import test from 'node:test';

import { isFetchAbortError } from './assistantStream';

test('isFetchAbortError detects DOMException AbortError', () => {
  assert.equal(isFetchAbortError(new DOMException('The operation was aborted.', 'AbortError')), true);
});

test('isFetchAbortError detects BodyStreamBuffer abort message', () => {
  assert.equal(isFetchAbortError(new Error('BodyStreamBuffer was aborted')), true);
});

test('isFetchAbortError ignores unrelated errors', () => {
  assert.equal(isFetchAbortError(new Error('network_error')), false);
  assert.equal(isFetchAbortError(null), false);
});
