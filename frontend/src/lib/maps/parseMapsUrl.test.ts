import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractMapsQueryText,
  parseMapsUrl,
  parsePastedCoordinates,
} from './parseMapsUrl.ts';

test('prefers the place pin over the camera center', () => {
  const parsed = parseMapsUrl(
    'https://www.google.com/maps/place/Tiendas+3B/@19.43,-99.13,17z/data=!3d19.4401!4d-99.1450',
  );
  assert.deepEqual(parsed, { latitude: 19.4401, longitude: -99.1450 });
});

test('extracts the place name from a maps place path', () => {
  assert.equal(
    extractMapsQueryText(
      'https://www.google.com/maps/place/Tiendas+3B+Coacalco/@19.43,-99.13,17z',
    ),
    'Tiendas 3B Coacalco',
  );
});

test('short links have no local coordinates', () => {
  assert.equal(parseMapsUrl('https://maps.app.goo.gl/4xyyaop7R9yPTeUMA'), null);
});

test('does not treat the camera center as the delivery pin', () => {
  assert.equal(
    parseMapsUrl('https://www.google.com/maps/place/Tiendas+3B/@19.43,-99.13,17z'),
    null,
  );
});

test('parses pasted latitude and longitude', () => {
  assert.deepEqual(parsePastedCoordinates('19.6245013, -99.1007997'), {
    latitude: 19.6245013,
    longitude: -99.1007997,
  });
  assert.deepEqual(parsePastedCoordinates('19.6245013,-99.1007997'), {
    latitude: 19.6245013,
    longitude: -99.1007997,
  });
  assert.deepEqual(parsePastedCoordinates('19.6245013 -99.1007997'), {
    latitude: 19.6245013,
    longitude: -99.1007997,
  });
});

test('parses hemisphere and labeled coordinates', () => {
  assert.deepEqual(parsePastedCoordinates('19.6245013 N, 99.1007997 W'), {
    latitude: 19.6245013,
    longitude: -99.1007997,
  });
  assert.deepEqual(parsePastedCoordinates('lat: 19.6245013 lng: -99.1007997'), {
    latitude: 19.6245013,
    longitude: -99.1007997,
  });
});

test('does not treat a street address as coordinates', () => {
  assert.equal(parsePastedCoordinates('Calle 19, colonia Centro'), null);
  assert.equal(parsePastedCoordinates('https://maps.app.goo.gl/abc'), null);
});
