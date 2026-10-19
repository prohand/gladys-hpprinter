// -----------------------------------------------------------------------------
// Printer addresses, as the user types them.
//
// A sysadmin pastes whatever they have at hand: a bare IP, a host name, an
// `ipp://` URI copied from a print server, an `http://host:631/...` URL. They
// all reduce to the same thing: a host, an IPP port and a resource path.
// -----------------------------------------------------------------------------

/** The IPP port and resource path of every IPP Everywhere / AirPrint printer. */
export const DEFAULT_PORT = 631;
export const DEFAULT_PATH = '/ipp/print';

/**
 * Parse one address.
 *
 * @param {string} raw `192.168.1.20`, `printer.lan:631`, `ipp://192.168.1.20/ipp/print`,
 *   `http://[fe80::1]:631/ipp/print`...
 * @returns {{ host: string, port: number, path: string } | null} null when unusable
 */
export function parseEndpoint(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }
  // `ipps://` and `https://` need the printer's self-signed certificate to be
  // trusted blindly: refused, rather than silently downgraded to plain text.
  if (/^(ipps|https):\/\//i.test(text)) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `ipp://${text}`;
  let url;
  try {
    url = new URL(withScheme.replace(/^ipp:\/\//i, 'http://'));
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || !url.hostname || url.username || url.password) {
    return null;
  }
  const explicitPort = /^[a-z]+:\/\/(\[[^\]]+\]|[^/:]+):(\d+)/i.test(withScheme);
  return {
    // `URL` keeps the brackets of an IPv6 host; they are added back when needed.
    host: url.hostname.replace(/^\[|\]$/g, ''),
    // `new URL` drops the default port of the scheme it parsed (80 for http):
    // only a port typed by hand is taken, IPP's 631 otherwise.
    port: explicitPort ? Number(url.port || 80) : DEFAULT_PORT,
    path: url.pathname && url.pathname !== '/' ? url.pathname : DEFAULT_PATH,
  };
}

/**
 * Parse the list typed in the configuration: one address per line, or
 * separated by commas, semicolons or spaces. Duplicates are dropped.
 *
 * @param {string} text
 * @returns {{ endpoints: Array<{ host: string, port: number, path: string }>, invalid: string[] }}
 */
export function parseEndpointList(text) {
  const endpoints = [];
  const invalid = [];
  const seen = new Set();
  for (const entry of String(text ?? '').split(/[\s,;]+/)) {
    if (!entry) {
      continue;
    }
    const endpoint = parseEndpoint(entry);
    if (!endpoint) {
      invalid.push(entry);
      continue;
    }
    const key = endpointKey(endpoint);
    if (!seen.has(key)) {
      seen.add(key);
      endpoints.push(endpoint);
    }
  }
  return { endpoints, invalid };
}

/** A stable string for one endpoint, used as a map key. */
export function endpointKey({ host, port, path }) {
  return `${host.toLowerCase()}:${port}${path}`;
}

/** The URL the HTTP request goes to. */
export function endpointUrl({ host, port, path }) {
  const bracketed = host.includes(':') ? `[${host}]` : host;
  return `http://${bracketed}:${port}${path}`;
}

/** The `printer-uri` operation attribute: the same address, in the ipp scheme. */
export function endpointPrinterUri({ host, port, path }) {
  const bracketed = host.includes(':') ? `[${host}]` : host;
  return `ipp://${bracketed}:${port}${path}`;
}

/** How the address reads in messages: the host, plus the port when unusual. */
export function endpointLabel({ host, port }) {
  return port === DEFAULT_PORT ? host : `${host}:${port}`;
}
