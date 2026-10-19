// -----------------------------------------------------------------------------
// Printer addresses: every form a user may paste.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  endpointKey,
  endpointLabel,
  endpointPrinterUri,
  endpointUrl,
  parseEndpoint,
  parseEndpointList,
} from '../src/printer/endpoint.js';

test('a bare IP or host name gets the IPP port and resource', () => {
  assert.deepEqual(parseEndpoint('192.168.1.20'), {
    host: '192.168.1.20',
    port: 631,
    path: '/ipp/print',
  });
  assert.deepEqual(parseEndpoint(' printer.lan '), {
    host: 'printer.lan',
    port: 631,
    path: '/ipp/print',
  });
});

test('a port and a path typed by hand are kept', () => {
  assert.deepEqual(parseEndpoint('192.168.1.20:8631'), {
    host: '192.168.1.20',
    port: 8631,
    path: '/ipp/print',
  });
  assert.deepEqual(parseEndpoint('ipp://10.0.0.5/ipp/printer'), {
    host: '10.0.0.5',
    port: 631,
    path: '/ipp/printer',
  });
  assert.deepEqual(parseEndpoint('http://10.0.0.5:631/ipp/print'), {
    host: '10.0.0.5',
    port: 631,
    path: '/ipp/print',
  });
  // An http URL without a port means port 80, like a browser reads it.
  assert.equal(parseEndpoint('http://10.0.0.5:80/ipp/print').port, 80);
});

test('IPv6 hosts lose their brackets, and get them back in URLs', () => {
  const endpoint = parseEndpoint('ipp://[fe80::1]:631/ipp/print');
  assert.equal(endpoint.host, 'fe80::1');
  assert.equal(endpointUrl(endpoint), 'http://[fe80::1]:631/ipp/print');
  assert.equal(endpointPrinterUri(endpoint), 'ipp://[fe80::1]:631/ipp/print');
});

test('TLS addresses, credentials and garbage are refused', () => {
  assert.equal(parseEndpoint('ipps://10.0.0.5/ipp/print'), null);
  assert.equal(parseEndpoint('https://10.0.0.5'), null);
  assert.equal(parseEndpoint('http://admin:secret@10.0.0.5'), null);
  assert.equal(parseEndpoint('ftp://10.0.0.5'), null);
  assert.equal(parseEndpoint(''), null);
  assert.equal(parseEndpoint(undefined), null);
});

test('a list splits on commas, semicolons, spaces and lines, without duplicates', () => {
  const { endpoints, invalid } = parseEndpointList(
    '192.168.1.20, 192.168.1.21;192.168.1.20\nipps://x  printer.lan',
  );
  assert.deepEqual(
    endpoints.map((e) => e.host),
    ['192.168.1.20', '192.168.1.21', 'printer.lan'],
  );
  assert.deepEqual(invalid, ['ipps://x']);
  assert.deepEqual(parseEndpointList(''), { endpoints: [], invalid: [] });
});

test('keys and labels', () => {
  const endpoint = { host: 'Printer.LAN', port: 631, path: '/ipp/print' };
  assert.equal(endpointKey(endpoint), 'printer.lan:631/ipp/print');
  assert.equal(endpointLabel(endpoint), 'Printer.LAN');
  assert.equal(endpointLabel({ ...endpoint, port: 8631 }), 'Printer.LAN:8631');
});
