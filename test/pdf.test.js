// -----------------------------------------------------------------------------
// The hand-written PDF: structure a printer accepts, text it prints right.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTextPdf, encodePdfString, wrapText } from '../src/printer/pdf.js';

test('the cross-reference table points at every object', () => {
  const pdf = buildTextPdf({ title: 'Courses', text: 'Lait\nPain\nŒufs' });
  const text = pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.endsWith('%%EOF\n'));

  const startxref = Number(/startxref\n(\d+)\n/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');
  const [, count] = /xref\n0 (\d+)\n/.exec(text);
  const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, Number(count) - 1);
  offsets.forEach((offset, index) => {
    assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`);
  });
});

test('stream lengths are byte lengths', () => {
  const text = buildTextPdf({ text: 'été — 10 €' }).toString('latin1');
  const match = /<< \/Length (\d+) >>\nstream\n/.exec(text);
  const start = match.index + match[0].length;
  const end = text.indexOf('\nendstream', start);
  assert.equal(end - start, Number(match[1]));
});

test('accents use WinAnsi, PDF delimiters are escaped, the rest becomes "?"', () => {
  assert.equal(encodePdfString('é'), '\xe9');
  assert.equal(encodePdfString('€ œ —'), '\x80 \x9c \x97');
  assert.equal(encodePdfString('a (b) \\c'), 'a \\(b\\) \\\\c');
  assert.equal(encodePdfString('漢 🙂'), '? ?');
});

test('long texts wrap on words and flow onto more pages', () => {
  const lines = wrapText(`${'word '.repeat(40)}\n${'x'.repeat(200)}`, 85);
  assert.ok(lines.every((line) => line.length <= 85));
  assert.equal(lines.filter((line) => /^x+$/.test(line)).length, 3);

  const many = buildTextPdf({
    text: Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n'),
  });
  assert.match(many.toString('latin1'), /\/Count 3 >>/);
  const empty = buildTextPdf({ text: '' });
  assert.match(empty.toString('latin1'), /\/Count 1 >>/);
});
