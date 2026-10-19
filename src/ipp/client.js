// -----------------------------------------------------------------------------
// IPP client: the two operations this integration sends to a printer.
//
//   - Get-Printer-Attributes: identity, state, alerts and supply levels, read
//     at every poll;
//   - Print-Job: a PDF built by src/printer/pdf.js (scene action and test
//     page).
//
// Plain HTTP on the LAN, Node's global `fetch`, no dependency. Every request
// has a deadline: a printer asleep or switched off must cost a poll, never a
// stuck handler.
// -----------------------------------------------------------------------------

import {
  OPERATIONS,
  VALUE_TAGS,
  decodeResponse,
  encodeRequest,
  isSuccessStatus,
} from './encoding.js';
import { endpointPrinterUri, endpointUrl } from '../printer/endpoint.js';

/** What a status poll asks for: nothing more, printers answer faster. */
export const STATUS_ATTRIBUTES = [
  'printer-uuid',
  'printer-name',
  'printer-info',
  'printer-make-and-model',
  'printer-device-id',
  'printer-firmware-string-version',
  'printer-state',
  'printer-state-reasons',
  'printer-state-message',
  'printer-is-accepting-jobs',
  'marker-names',
  'marker-colors',
  'marker-types',
  'marker-levels',
  'marker-low-levels',
  'marker-high-levels',
  'printer-impressions-completed',
  'document-format-supported',
];

const DEFAULT_TIMEOUT_MS = 8_000;
const PRINT_TIMEOUT_MS = 30_000;

let nextRequestId = 1;

export class IppError extends Error {
  constructor(message, { statusCode, code } = {}) {
    super(message);
    this.name = 'IppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function send(endpoint, body, timeoutMs) {
  let response;
  try {
    response = await fetch(endpointUrl(endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/ipp', accept: 'application/ipp' },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // `fetch` hides the useful part ("ECONNREFUSED", "EHOSTUNREACH") in
    // `cause`; a port it refuses to call ("bad port") only has a message.
    const code =
      err.cause?.code ??
      (err.name === 'TimeoutError' ? 'TIMEOUT' : (err.cause?.message ?? err.message));
    throw new IppError(`${endpoint.host}: ${code}`, { code });
  }
  if (!response.ok) {
    throw new IppError(`${endpoint.host}: HTTP ${response.status}`, {
      code: `HTTP_${response.status}`,
    });
  }
  const decoded = decodeResponse(Buffer.from(await response.arrayBuffer()));
  if (!isSuccessStatus(decoded.statusCode)) {
    throw new IppError(
      `${endpoint.host}: IPP status 0x${decoded.statusCode.toString(16).padStart(4, '0')}`,
      { statusCode: decoded.statusCode, code: 'IPP_STATUS' },
    );
  }
  return decoded;
}

function operationAttributes(endpoint) {
  return [
    { tag: VALUE_TAGS.CHARSET, name: 'attributes-charset', values: ['utf-8'] },
    { tag: VALUE_TAGS.NATURAL_LANGUAGE, name: 'attributes-natural-language', values: ['en'] },
    { tag: VALUE_TAGS.URI, name: 'printer-uri', values: [endpointPrinterUri(endpoint)] },
  ];
}

/**
 * Read the printer attributes.
 *
 * @param {{ host: string, port: number, path: string }} endpoint
 * @param {{ attributes?: string[], timeoutMs?: number }} [options]
 * @returns {Promise<Record<string, any>>} the printer attributes group
 */
export async function getPrinterAttributes(endpoint, options = {}) {
  const body = encodeRequest({
    operation: OPERATIONS.GET_PRINTER_ATTRIBUTES,
    requestId: nextRequestId++,
    attributes: [
      ...operationAttributes(endpoint),
      {
        tag: VALUE_TAGS.KEYWORD,
        name: 'requested-attributes',
        values: options.attributes ?? STATUS_ATTRIBUTES,
      },
    ],
  });
  const response = await send(endpoint, body, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return response.printer;
}

/**
 * Send a document to print.
 *
 * @param {{ host: string, port: number, path: string }} endpoint
 * @param {{ document: Buffer, format: string, jobName: string, timeoutMs?: number }} job
 * @returns {Promise<{ jobId: number | null }>}
 */
export async function printJob(endpoint, { document, format, jobName, timeoutMs }) {
  const body = encodeRequest({
    operation: OPERATIONS.PRINT_JOB,
    requestId: nextRequestId++,
    attributes: [
      ...operationAttributes(endpoint),
      { tag: VALUE_TAGS.NAME, name: 'requesting-user-name', values: ['gladys'] },
      { tag: VALUE_TAGS.NAME, name: 'job-name', values: [jobName.slice(0, 255)] },
      { tag: VALUE_TAGS.MIME_MEDIA_TYPE, name: 'document-format', values: [format] },
    ],
    data: document,
  });
  const response = await send(endpoint, body, timeoutMs ?? PRINT_TIMEOUT_MS);
  const jobId = response.job['job-id'];
  return { jobId: Number.isInteger(jobId) ? jobId : null };
}

export const ippClient = { getPrinterAttributes, printJob };
