// -----------------------------------------------------------------------------
// IPP binary encoding (RFC 8010), the subset a printer status reader needs.
//
// Every network printer HP sold in the last fifteen years speaks IPP on port
// 631 (it is what AirPrint and Mopria are built on), so it is the one protocol
// that works across the whole range without a vendor SDK. A request is an HTTP
// POST of `application/ipp`: a fixed header, attribute groups, then the
// optional document data.
//
// Only what we send is encoded (strings, keywords, integers); the decoder, on
// the other hand, has to walk ANY answer a printer may give — collections and
// out-of-band values included — because skipping an attribute requires
// parsing it.
// -----------------------------------------------------------------------------

/** Delimiter tags: they open an attribute group or end the message. */
export const GROUP_TAGS = {
  OPERATION: 0x01,
  JOB: 0x02,
  END: 0x03,
  PRINTER: 0x04,
  UNSUPPORTED: 0x05,
};

/** Value tags used by this integration. */
export const VALUE_TAGS = {
  UNSUPPORTED: 0x10,
  UNKNOWN: 0x12,
  NO_VALUE: 0x13,
  INTEGER: 0x21,
  BOOLEAN: 0x22,
  ENUM: 0x23,
  OCTET_STRING: 0x30,
  DATE_TIME: 0x31,
  RESOLUTION: 0x32,
  RANGE_OF_INTEGER: 0x33,
  BEGIN_COLLECTION: 0x34,
  TEXT_WITH_LANGUAGE: 0x35,
  NAME_WITH_LANGUAGE: 0x36,
  END_COLLECTION: 0x37,
  TEXT: 0x41,
  NAME: 0x42,
  KEYWORD: 0x44,
  URI: 0x45,
  CHARSET: 0x47,
  NATURAL_LANGUAGE: 0x48,
  MIME_MEDIA_TYPE: 0x49,
  MEMBER_ATTR_NAME: 0x4a,
};

export const OPERATIONS = {
  PRINT_JOB: 0x0002,
  GET_PRINTER_ATTRIBUTES: 0x000b,
};

/** IPP status codes below 0x0100 are successes (some with a warning). */
export function isSuccessStatus(statusCode) {
  return statusCode >= 0x0000 && statusCode < 0x0100;
}

/**
 * Encode an IPP request.
 *
 * @param {object} request
 * @param {number} request.operation one of OPERATIONS
 * @param {number} request.requestId
 * @param {Array<{ tag: number, name: string, values: Array<string|number|boolean> }>} request.attributes
 *   operation attributes, in order (the charset and language first, as RFC 8011 demands)
 * @param {Buffer} [request.data] document data, appended after the attributes
 * @returns {Buffer}
 */
export function encodeRequest({ operation, requestId, attributes, data }) {
  const parts = [];
  const header = Buffer.alloc(8);
  header.writeUInt8(2, 0); // version 2.0
  header.writeUInt8(0, 1);
  header.writeUInt16BE(operation, 2);
  header.writeInt32BE(requestId, 4);
  parts.push(header, Buffer.from([GROUP_TAGS.OPERATION]));

  for (const { tag, name, values } of attributes) {
    values.forEach((value, index) => {
      // Additional values of a multi-valued attribute carry an empty name.
      parts.push(encodeAttribute(tag, index === 0 ? name : '', value));
    });
  }
  parts.push(Buffer.from([GROUP_TAGS.END]));
  if (data) {
    parts.push(data);
  }
  return Buffer.concat(parts);
}

function encodeAttribute(tag, name, value) {
  const nameBytes = Buffer.from(name, 'utf8');
  let valueBytes;
  if (tag === VALUE_TAGS.INTEGER || tag === VALUE_TAGS.ENUM) {
    valueBytes = Buffer.alloc(4);
    valueBytes.writeInt32BE(value, 0);
  } else if (tag === VALUE_TAGS.BOOLEAN) {
    valueBytes = Buffer.from([value ? 1 : 0]);
  } else {
    valueBytes = Buffer.from(String(value), 'utf8');
  }
  const head = Buffer.alloc(3);
  head.writeUInt8(tag, 0);
  head.writeUInt16BE(nameBytes.length, 1);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(valueBytes.length, 0);
  return Buffer.concat([head, nameBytes, length, valueBytes]);
}

/**
 * Decode an IPP response.
 *
 * Attributes are returned per group, as `{ name: value }` for a single value
 * and `{ name: [values] }` for a multi-valued one. Out-of-band values
 * (unknown, no-value...) decode to `null`.
 *
 * @param {Buffer} buffer
 * @returns {{ version: string, statusCode: number, requestId: number,
 *   operation: Record<string, any>, printer: Record<string, any>, job: Record<string, any> }}
 */
export function decodeResponse(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 9) {
    throw new Error('IPP response too short');
  }
  const reader = createReader(buffer);
  const major = reader.uint8();
  const minor = reader.uint8();
  const statusCode = reader.uint16();
  const requestId = reader.int32();
  const groups = { operation: {}, printer: {}, job: {}, unsupported: {} };
  const groupNames = {
    [GROUP_TAGS.OPERATION]: 'operation',
    [GROUP_TAGS.JOB]: 'job',
    [GROUP_TAGS.PRINTER]: 'printer',
    [GROUP_TAGS.UNSUPPORTED]: 'unsupported',
  };

  let current = null;
  let lastName = null;
  while (!reader.done()) {
    const tag = reader.uint8();
    if (tag === GROUP_TAGS.END) {
      break;
    }
    if (tag < 0x10) {
      // A group we do not read (event notification...) still has to be walked.
      current = groupNames[tag] ? groups[groupNames[tag]] : {};
      lastName = null;
      continue;
    }
    const name = reader.string(reader.uint16());
    const value = readValue(reader, tag);
    if (!current) {
      throw new Error('IPP attribute outside of any group');
    }
    if (name === '') {
      // Additional value of the previous attribute.
      if (lastName === null) {
        throw new Error('IPP additional value without an attribute');
      }
      const previous = current[lastName];
      current[lastName] = Array.isArray(previous) ? [...previous, value] : [previous, value];
    } else {
      current[name] = value;
      lastName = name;
    }
  }

  return {
    version: `${major}.${minor}`,
    statusCode,
    requestId,
    operation: groups.operation,
    printer: groups.printer,
    job: groups.job,
  };
}

function readValue(reader, tag) {
  const length = reader.uint16();
  switch (tag) {
    case VALUE_TAGS.INTEGER:
    case VALUE_TAGS.ENUM:
      return length === 4 ? reader.int32() : reader.skip(length);
    case VALUE_TAGS.BOOLEAN:
      return reader.uint8() !== 0;
    case VALUE_TAGS.RANGE_OF_INTEGER: {
      const lower = reader.int32();
      return { lower, upper: reader.int32() };
    }
    case VALUE_TAGS.RESOLUTION: {
      const x = reader.int32();
      const y = reader.int32();
      return { x, y, units: reader.uint8() };
    }
    case VALUE_TAGS.TEXT_WITH_LANGUAGE:
    case VALUE_TAGS.NAME_WITH_LANGUAGE: {
      const language = reader.string(reader.uint16());
      return { language, text: reader.string(reader.uint16()) };
    }
    case VALUE_TAGS.BEGIN_COLLECTION:
      reader.skip(length);
      return readCollection(reader);
    case VALUE_TAGS.OCTET_STRING:
    case VALUE_TAGS.DATE_TIME:
      return reader.bytes(length);
    case VALUE_TAGS.UNSUPPORTED:
    case VALUE_TAGS.UNKNOWN:
    case VALUE_TAGS.NO_VALUE:
      reader.skip(length);
      return null;
    default:
      // text, name, keyword, uri, charset, language, mimeMediaType and every
      // string-like tag a newer printer may add.
      return reader.string(length);
  }
}

// A collection is a sequence of memberAttrName / value pairs closed by an
// endCollection, each with an empty attribute name (RFC 8010 §3.1.6).
function readCollection(reader) {
  const collection = {};
  let member = null;
  while (!reader.done()) {
    const tag = reader.uint8();
    reader.skip(reader.uint16()); // name, always empty inside a collection
    if (tag === VALUE_TAGS.END_COLLECTION) {
      reader.skip(reader.uint16());
      return collection;
    }
    if (tag === VALUE_TAGS.MEMBER_ATTR_NAME) {
      member = reader.string(reader.uint16());
      continue;
    }
    const value = readValue(reader, tag);
    if (member !== null) {
      const previous = collection[member];
      collection[member] =
        previous === undefined
          ? value
          : Array.isArray(previous)
            ? [...previous, value]
            : [previous, value];
    }
  }
  throw new Error('IPP collection not terminated');
}

function createReader(buffer) {
  let offset = 0;
  const need = (count) => {
    if (offset + count > buffer.length) {
      throw new Error('IPP response truncated');
    }
  };
  return {
    done: () => offset >= buffer.length,
    uint8() {
      need(1);
      return buffer.readUInt8(offset++);
    },
    uint16() {
      need(2);
      const value = buffer.readUInt16BE(offset);
      offset += 2;
      return value;
    },
    int32() {
      need(4);
      const value = buffer.readInt32BE(offset);
      offset += 4;
      return value;
    },
    string(length) {
      need(length);
      const value = buffer.toString('utf8', offset, offset + length);
      offset += length;
      return value;
    },
    bytes(length) {
      need(length);
      const value = buffer.subarray(offset, offset + length);
      offset += length;
      return Buffer.from(value);
    },
    skip(length) {
      need(length);
      offset += length;
      return null;
    },
  };
}
