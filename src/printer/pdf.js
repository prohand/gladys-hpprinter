// -----------------------------------------------------------------------------
// A text-only PDF, written by hand.
//
// The "Print a text" scene action and the test page send a PDF: it is the one
// document format IPP printers accept across the HP range (plain text is
// often refused, raster formats would need a font renderer). A text page needs
// a tiny subset of PDF 1.4: A4 pages, the standard Helvetica fonts every PDF
// reader and printer ships (nothing to embed), WinAnsi encoding — enough for
// English, French, German and Spanish.
// -----------------------------------------------------------------------------

const PAGE_WIDTH = 595; // A4, in points
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const FONT_SIZE = 11;
const LEADING = 15;
const TITLE_SIZE = 16;
// Helvetica averages about half an em per character: 85 characters fill the
// 483 pt between the margins without running off the page.
const LINE_CHARS = 85;
const MAX_PAGES = 20;

// The characters of WinAnsiEncoding outside Latin-1 (0x80–0x9F).
const WIN_ANSI_EXTRA = new Map([
  ['€', 0x80],
  ['‚', 0x82],
  ['„', 0x84],
  ['…', 0x85],
  ['‹', 0x8b],
  ['Œ', 0x8c],
  ['‘', 0x91],
  ['’', 0x92],
  ['“', 0x93],
  ['”', 0x94],
  ['•', 0x95],
  ['–', 0x96],
  ['—', 0x97],
  ['›', 0x9b],
  ['œ', 0x9c],
  ['Ÿ', 0x9f],
]);

/** One line as a PDF string literal body, WinAnsi bytes, special characters escaped. */
export function encodePdfString(text) {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    let byte;
    if (WIN_ANSI_EXTRA.has(char)) {
      byte = WIN_ANSI_EXTRA.get(char);
    } else if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff)) {
      byte = code;
    } else {
      byte = 0x3f; // '?': no glyph for it in the standard fonts
    }
    const ch = String.fromCharCode(byte);
    out += ch === '\\' || ch === '(' || ch === ')' ? `\\${ch}` : ch;
  }
  return out;
}

/** Split a text into lines that fit the page width, words kept whole when possible. */
export function wrapText(text, width = LINE_CHARS) {
  const lines = [];
  for (const paragraph of String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      let rest = word;
      while (rest.length > width) {
        // A word longer than a line (a URL...) is cut.
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      if (!line) {
        line = rest;
      } else if (line.length + 1 + rest.length <= width) {
        line += ` ${rest}`;
      } else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

function pageContent(title, lines) {
  const parts = ['BT'];
  let y = PAGE_HEIGHT - MARGIN;
  if (title) {
    parts.push(`/F2 ${TITLE_SIZE} Tf ${MARGIN} ${y} Td (${encodePdfString(title)}) Tj ET BT`);
    y -= TITLE_SIZE + LEADING;
  }
  parts.push(`/F1 ${FONT_SIZE} Tf ${LEADING} TL ${MARGIN} ${y} Td`);
  for (const line of lines) {
    parts.push(`(${encodePdfString(line)}) Tj T*`);
  }
  parts.push('ET');
  return parts.join('\n');
}

/**
 * Build a PDF of plain text.
 *
 * @param {{ title?: string, text: string }} content the title is printed in
 *   bold on the first page
 * @returns {Buffer}
 */
export function buildTextPdf({ title = '', text }) {
  const usable = PAGE_HEIGHT - 2 * MARGIN;
  const linesPerPage = Math.floor(usable / LEADING);
  const firstPageLines = Math.floor((usable - TITLE_SIZE - LEADING) / LEADING);
  const lines = wrapText(text);
  const pages = [];
  let offset = 0;
  while ((offset < lines.length || pages.length === 0) && pages.length < MAX_PAGES) {
    const count = pages.length === 0 && title ? firstPageLines : linesPerPage;
    pages.push(lines.slice(offset, offset + count));
    offset += count;
  }

  // Objects: 1 catalog, 2 page tree, 3-4 fonts, then a page + its content per page.
  const objects = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const stream = pageContent(index === 0 ? title : '', pageLines);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] =
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  });

  // Every string above is single-byte (WinAnsi), so latin1 lengths are byte
  // offsets — which is what the cross-reference table must point at.
  let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(body, 'latin1');
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
