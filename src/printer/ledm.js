// -----------------------------------------------------------------------------
// HP LEDM ("Low End Data Model"): the XML pages of the HP embedded web server.
//
// IPP gives the state and the supplies, but most HP printers do not report
// their page counter there (`printer-impressions-completed` is recent and
// rare). Their embedded web server does, in
// `/DevMgmt/ProductUsageDyn.xml` — the page the "Usage" screen of the EWS is
// built from. It is read on port 80 of the same host, best effort: a printer
// without it (or that only serves its EWS over HTTPS) simply has no counter.
//
// No XML parser: the one number we want is the first `TotalImpressions`
// element, whatever its namespace prefix.
// -----------------------------------------------------------------------------

const USAGE_PATH = '/DevMgmt/ProductUsageDyn.xml';
const TIMEOUT_MS = 5_000;
// The usage document of a large MFP is a few tens of KB: anything far bigger
// is not the page we asked for.
const MAX_BYTES = 512 * 1024;

/**
 * Extract the total impressions from a ProductUsageDyn document.
 *
 * @param {string} xml
 * @returns {number | null}
 */
export function parseTotalImpressions(xml) {
  const match = /<(?:[\w-]+:)?TotalImpressions\b[^>]*>\s*(\d+)\s*</.exec(String(xml ?? ''));
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Read the page counter of an HP printer, or null when it has none to give.
 *
 * @param {{ host: string }} endpoint
 * @returns {Promise<number | null>}
 */
export async function readTotalImpressions({ host }) {
  const bracketed = host.includes(':') ? `[${host}]` : host;
  try {
    const response = await fetch(`http://${bracketed}${USAGE_PATH}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // An EWS that moved to HTTPS redirects there: not followed, the printer
      // certificate is self-signed and would have to be trusted blindly.
      redirect: 'manual',
    });
    if (!response.ok) {
      return null;
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BYTES) {
      return null;
    }
    const text = await response.text();
    return text.length > MAX_BYTES ? null : parseTotalImpressions(text);
  } catch {
    return null;
  }
}
