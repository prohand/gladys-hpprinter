// -----------------------------------------------------------------------------
// IPP binary encoding: what we send, and every shape of answer we must walk.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIONS,
  VALUE_TAGS,
  decodeResponse,
  encodeRequest,
  isSuccessStatus,
} from '../src/ipp/encoding.js';
import { encodeAttribute, encodeResponse } from './helpers/fakePrinter.js';

const T = VALUE_TAGS;

test('a request carries the version, operation, id, then its attributes in order', () => {
  const body = encodeRequest({
    operation: OPERATIONS.GET_PRINTER_ATTRIBUTES,
    requestId: 7,
    attributes: [
      { tag: T.CHARSET, name: 'attributes-charset', values: ['utf-8'] },
      { tag: T.KEYWORD, name: 'requested-attributes', values: ['printer-state', 'marker-levels'] },
    ],
  });
  assert.deepEqual([...body.subarray(0, 8)], [2, 0, 0, 0x0b, 0, 0, 0, 7]);
  // A request has the layout of a response: the decoder reads it back.
  const decoded = decodeResponse(body);
  assert.equal(decoded.statusCode, OPERATIONS.GET_PRINTER_ATTRIBUTES);
  assert.equal(decoded.operation['attributes-charset'], 'utf-8');
  assert.deepEqual(decoded.operation['requested-attributes'], ['printer-state', 'marker-levels']);
  assert.equal(body.at(-1), 0x03, 'ends with end-of-attributes');
});

test('document data follows the end-of-attributes tag', () => {
  const body = encodeRequest({
    operation: OPERATIONS.PRINT_JOB,
    requestId: 1,
    attributes: [{ tag: T.CHARSET, name: 'attributes-charset', values: ['utf-8'] }],
    data: Buffer.from('%PDF-1.4'),
  });
  assert.equal(body.subarray(-9).toString('latin1'), '\x03%PDF-1.4');
});

test('a response decodes single values, multi-values, booleans and negative integers', () => {
  const decoded = decodeResponse(
    encodeResponse({
      statusCode: 0x0001,
      requestId: 9,
      printer: [
        encodeAttribute('printer-state', T.ENUM, 5),
        encodeAttribute('printer-is-accepting-jobs', T.BOOLEAN, false),
        encodeAttribute('marker-levels', T.INTEGER, [80, -3, 0]),
        encodeAttribute('printer-state-reasons', T.KEYWORD, ['media-empty-error']),
        encodeAttribute('printer-info', T.TEXT_WITH_LANGUAGE, { language: 'fr', text: 'Bureau' }),
      ],
    }),
  );
  assert.equal(decoded.statusCode, 1);
  assert.equal(decoded.requestId, 9);
  assert.equal(decoded.printer['printer-state'], 5);
  assert.equal(decoded.printer['printer-is-accepting-jobs'], false);
  assert.deepEqual(decoded.printer['marker-levels'], [80, -3, 0]);
  assert.equal(decoded.printer['printer-state-reasons'], 'media-empty-error');
  assert.deepEqual(decoded.printer['printer-info'], { language: 'fr', text: 'Bureau' });
});

test('collections and out-of-band values are walked, so what follows them still decodes', () => {
  const decoded = decodeResponse(
    encodeResponse({
      printer: [
        encodeAttribute('media-col-default', T.BEGIN_COLLECTION, {
          'media-type': [T.KEYWORD, 'stationery'],
          'media-size': [T.BEGIN_COLLECTION, { 'x-dimension': [T.INTEGER, 21000] }],
        }),
        encodeAttribute('printer-alert', T.UNKNOWN, null),
        encodeAttribute('printer-state', T.ENUM, 3),
      ],
    }),
  );
  assert.deepEqual(decoded.printer['media-col-default'], {
    'media-type': 'stationery',
    'media-size': { 'x-dimension': 21000 },
  });
  assert.equal(decoded.printer['printer-alert'], null);
  assert.equal(decoded.printer['printer-state'], 3);
});

test('a truncated or empty answer is an error, not a crash later', () => {
  const full = encodeResponse({ printer: [encodeAttribute('printer-state', T.ENUM, 3)] });
  assert.throws(() => decodeResponse(full.subarray(0, full.length - 4)), /truncated/);
  assert.throws(() => decodeResponse(Buffer.alloc(3)), /too short/);
  assert.throws(() => decodeResponse('nope'), /too short/);
});

test('only status codes under 0x0100 are successes', () => {
  assert.ok(isSuccessStatus(0x0000));
  assert.ok(isSuccessStatus(0x0002));
  assert.ok(!isSuccessStatus(0x0400));
  assert.ok(!isSuccessStatus(0x0507));
});
