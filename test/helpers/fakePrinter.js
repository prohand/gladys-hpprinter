// -----------------------------------------------------------------------------
// A fake IPP printer on 127.0.0.1, for the tests: a real HTTP server speaking
// the IPP binary format, so the client, the decoder and the fleet are tested
// end to end without any hardware nor any network beyond the loopback.
// -----------------------------------------------------------------------------

import { createServer } from 'node:http';
import { VALUE_TAGS, decodeResponse } from '../../src/ipp/encoding.js';

const T = VALUE_TAGS;

/** Encode one attribute (all its values) the way a printer would. */
export function encodeAttribute(name, tag, values) {
  const list = Array.isArray(values) ? values : [values];
  return Buffer.concat(
    list.map((value, index) => encodeValue(index === 0 ? name : '', tag, value)),
  );
}

function head(tag, name) {
  const nameBytes = Buffer.from(name, 'utf8');
  const out = Buffer.alloc(3 + nameBytes.length);
  out.writeUInt8(tag, 0);
  out.writeUInt16BE(nameBytes.length, 1);
  nameBytes.copy(out, 3);
  return out;
}

function withLength(bytes) {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

function encodeValue(name, tag, value) {
  if (tag === T.INTEGER || tag === T.ENUM) {
    const bytes = Buffer.alloc(4);
    bytes.writeInt32BE(value, 0);
    return Buffer.concat([head(tag, name), withLength(bytes)]);
  }
  if (tag === T.BOOLEAN) {
    return Buffer.concat([head(tag, name), withLength(Buffer.from([value ? 1 : 0]))]);
  }
  if (tag === T.TEXT_WITH_LANGUAGE) {
    const inner = Buffer.concat([
      withLength(Buffer.from(value.language)),
      withLength(Buffer.from(value.text)),
    ]);
    return Buffer.concat([head(tag, name), withLength(inner)]);
  }
  if (tag === T.BEGIN_COLLECTION) {
    // value: { member: [tag, value] }
    const members = Object.entries(value).map(([member, [memberTag, memberValue]]) =>
      Buffer.concat([
        head(T.MEMBER_ATTR_NAME, ''),
        withLength(Buffer.from(member)),
        encodeValue('', memberTag, memberValue),
      ]),
    );
    return Buffer.concat([
      head(tag, name),
      withLength(Buffer.alloc(0)),
      ...members,
      head(T.END_COLLECTION, ''),
      withLength(Buffer.alloc(0)),
    ]);
  }
  if (tag === T.NO_VALUE || tag === T.UNKNOWN) {
    return Buffer.concat([head(tag, name), withLength(Buffer.alloc(0))]);
  }
  return Buffer.concat([head(tag, name), withLength(Buffer.from(String(value), 'utf8'))]);
}

/**
 * Build a whole IPP response.
 *
 * @param {{ statusCode?: number, requestId?: number, printer?: Buffer[], job?: Buffer[] }} parts
 */
export function encodeResponse({ statusCode = 0, requestId = 1, printer = [], job = [] }) {
  const header = Buffer.alloc(8);
  header.writeUInt8(2, 0);
  header.writeUInt8(0, 1);
  header.writeUInt16BE(statusCode, 2);
  header.writeInt32BE(requestId, 4);
  const groups = [
    Buffer.from([0x01]),
    encodeAttribute('attributes-charset', T.CHARSET, 'utf-8'),
    encodeAttribute('attributes-natural-language', T.NATURAL_LANGUAGE, 'en'),
  ];
  if (printer.length > 0) {
    groups.push(Buffer.from([0x04]), ...printer);
  }
  if (job.length > 0) {
    groups.push(Buffer.from([0x02]), ...job);
  }
  return Buffer.concat([header, ...groups, Buffer.from([0x03])]);
}

/** The attributes of a typical HP inkjet, every value overridable. */
export function hpAttributes(overrides = {}) {
  const values = {
    uuid: 'urn:uuid:12345678-90ab-cdef-1234-567890abcdef',
    info: 'HP OfficeJet Pro 9010 series [A1B2C3]',
    model: 'HP OfficeJet Pro 9010 series',
    deviceId: 'MFG:HP;MDL:OfficeJet Pro 9010 series;CMD:PCL,PDF;SN:CN0123ABCD;',
    state: 3,
    reasons: ['none'],
    names: ['black ink', 'cyan ink', 'magenta ink', 'yellow ink'],
    colors: ['#000000', '#00FFFF', '#FF00FF', '#FFFF00'],
    types: ['ink-cartridge', 'ink-cartridge', 'ink-cartridge', 'ink-cartridge'],
    levels: [60, 40, 30, 20],
    formats: ['application/pdf', 'image/urf', 'image/pwg-raster'],
    impressions: undefined,
    ...overrides,
  };
  const attributes = [
    encodeAttribute('printer-uuid', T.URI, values.uuid),
    encodeAttribute('printer-info', T.TEXT, values.info),
    encodeAttribute('printer-make-and-model', T.TEXT, values.model),
    encodeAttribute('printer-device-id', T.TEXT, values.deviceId),
    encodeAttribute('printer-state', T.ENUM, values.state),
    encodeAttribute('printer-state-reasons', T.KEYWORD, values.reasons),
    encodeAttribute('printer-is-accepting-jobs', T.BOOLEAN, true),
    encodeAttribute('marker-names', T.NAME, values.names),
    encodeAttribute('marker-colors', T.NAME, values.colors),
    encodeAttribute('marker-types', T.KEYWORD, values.types),
    encodeAttribute('marker-levels', T.INTEGER, values.levels),
    encodeAttribute('document-format-supported', T.MIME_MEDIA_TYPE, values.formats),
  ];
  if (values.uuid === null) {
    attributes.shift();
  }
  if (values.impressions !== undefined) {
    attributes.push(
      encodeAttribute('printer-impressions-completed', T.INTEGER, values.impressions),
    );
  }
  return attributes;
}

/**
 * Start a fake printer.
 *
 * @param {{ attributes?: object }} [options] overrides of hpAttributes()
 * @returns {Promise<{ endpoint: object, set: Function, requests: object[], jobs: object[],
 *   down: Function, up: Function, close: Function }>}
 */
export async function startFakePrinter(options = {}) {
  let overrides = options.attributes ?? {};
  let answering = true;
  let printStatus = 0;
  const requests = [];
  const jobs = [];

  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (!answering) {
        res.writeHead(503).end();
        return;
      }
      const body = Buffer.concat(chunks);
      // A request has the layout of a response, the operation in place of
      // the status code: the same decoder reads it.
      const decoded = decodeResponse(body);
      const operation = decoded.statusCode;
      requests.push({ path: req.url, operation, attributes: decoded.operation });
      res.setHeader('content-type', 'application/ipp');
      if (operation === 0x0002) {
        const document = locateDocument(body);
        jobs.push({ attributes: decoded.operation, document });
        res.end(
          encodeResponse({
            statusCode: printStatus,
            requestId: decoded.requestId,
            job: printStatus === 0 ? [encodeAttribute('job-id', T.INTEGER, 42)] : [],
          }),
        );
        return;
      }
      res.end(encodeResponse({ requestId: decoded.requestId, printer: hpAttributes(overrides) }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    endpoint: { host: '127.0.0.1', port, path: '/ipp/print' },
    requests,
    jobs,
    set(next) {
      overrides = { ...overrides, ...next };
    },
    refusePrints(status = 0x040a) {
      printStatus = status;
    },
    down() {
      answering = false;
    },
    up() {
      answering = true;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// The document starts right after the end-of-attributes tag: walk the
// attributes to find that tag (a 0x03 byte can also appear inside a value).
function locateDocument(body) {
  let offset = 9; // header + operation-attributes tag
  while (offset < body.length) {
    const tag = body[offset];
    if (tag === 0x03) {
      return body.subarray(offset + 1);
    }
    if (tag < 0x10) {
      offset += 1;
      continue;
    }
    const nameLength = body.readUInt16BE(offset + 1);
    const valueLength = body.readUInt16BE(offset + 3 + nameLength);
    offset += 5 + nameLength + valueLength;
  }
  return Buffer.alloc(0);
}
