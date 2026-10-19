// -----------------------------------------------------------------------------
// mDNS answers relayed by the Gladys core: keep the HP printers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMdnsPrinters } from '../src/printer/discovery.js';
import { parseTotalImpressions } from '../src/printer/ledm.js';

const HP = {
  name: 'HP OfficeJet Pro 9010 series [A1B2C3]',
  host: 'HPA1B2C3.local',
  addresses: ['fe80::1234', '192.168.1.20'],
  port: 631,
  txt: [
    'txtvers=1',
    'rp=ipp/print',
    'ty=HP OfficeJet Pro 9010 series',
    'usb_MFG=HP',
    'UUID=AAAA-BBBB',
  ],
};

test('HP printers are kept, with their IPv4 address, resource and UUID', () => {
  assert.deepEqual(parseMdnsPrinters([HP]), [
    {
      uuid: 'aaaa-bbbb',
      name: 'HP OfficeJet Pro 9010 series',
      endpoint: { host: '192.168.1.20', port: 631, path: '/ipp/print' },
    },
  ]);
});

test('other brands are left out, duplicates (IPv4 + IPv6 answers) merged', () => {
  const brother = {
    ...HP,
    name: 'Brother HL-L2350DW',
    txt: ['ty=Brother HL-L2350DW', 'usb_MFG=Brother'],
  };
  const found = parseMdnsPrinters([HP, brother, { ...HP, addresses: ['192.168.1.20'] }]);
  assert.equal(found.length, 1);
});

test('missing pieces fall back to sane values', () => {
  const [printer] = parseMdnsPrinters([
    {
      name: 'HP DeskJet 2700',
      host: 'deskjet.local.',
      addresses: [],
      txt: ['usb_MFG=Hewlett-Packard'],
    },
  ]);
  assert.deepEqual(printer, {
    uuid: null,
    name: 'HP DeskJet 2700',
    endpoint: { host: 'deskjet.local', port: 631, path: '/ipp/print' },
  });
  assert.deepEqual(parseMdnsPrinters(undefined), []);
});

test('the LEDM page counter is read whatever the namespace prefix', () => {
  const xml = `<?xml version="1.0"?><pudyn:ProductUsageDyn><pudyn:PrinterSubunit>
    <dd:TotalImpressions PEID="5082">4567</dd:TotalImpressions></pudyn:PrinterSubunit></pudyn:ProductUsageDyn>`;
  assert.equal(parseTotalImpressions(xml), 4567);
  assert.equal(parseTotalImpressions('<TotalImpressions>12</TotalImpressions>'), 12);
  assert.equal(parseTotalImpressions('<html>login</html>'), null);
  assert.equal(parseTotalImpressions(undefined), null);
});
