// -----------------------------------------------------------------------------
// Finding the HP printers of the LAN.
//
// Printers announce their IPP service over mDNS (`_ipp._tcp`, it is how
// AirPrint finds them). The integration's container sits on a Docker bridge
// that multicast never crosses, so the browse is done by the Gladys core on
// the host network (manifest `network_discovery`) and only the raw answers come
// back here. The TXT record says who made the printer (`usb_MFG`, `ty`), where
// its IPP resource lives (`rp`) and its UUID.
// -----------------------------------------------------------------------------

import { parseMdnsTxt } from '@gladysassistant/integration-sdk';
import { DEFAULT_PORT } from './endpoint.js';

const HP = /\b(hp|hewlett[- ]?packard)\b/i;

function isIpv4(address) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(address);
}

/**
 * Keep the HP printers among raw mDNS results.
 *
 * @param {Array<{ name?: string, host?: string, addresses?: string[], port?: number, txt?: string[] }>} results
 * @returns {Array<{ uuid: string | null, name: string, endpoint: { host: string, port: number, path: string } }>}
 */
export function parseMdnsPrinters(results) {
  const printers = [];
  const seen = new Set();
  for (const result of Array.isArray(results) ? results : []) {
    const txt = parseMdnsTxt(result.txt ?? []);
    const maker = [txt.usb_mfg, txt.ty, txt.product, result.name].filter(Boolean).join(' ');
    if (!HP.test(maker)) {
      continue;
    }
    const addresses = (result.addresses ?? []).filter(Boolean);
    // IPv4 first: a link-local IPv6 address needs a zone id the container
    // does not have.
    const host =
      addresses.find(isIpv4) ?? addresses[0] ?? String(result.host ?? '').replace(/\.$/, '');
    if (!host) {
      continue;
    }
    const resource = typeof txt.rp === 'string' && txt.rp ? txt.rp : 'ipp/print';
    const endpoint = {
      host,
      port: Number.isInteger(result.port) ? result.port : DEFAULT_PORT,
      path: `/${resource.replace(/^\/+/, '')}`,
    };
    const uuid = typeof txt.uuid === 'string' ? txt.uuid.toLowerCase() : null;
    const key = uuid ?? `${endpoint.host}:${endpoint.port}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    printers.push({ uuid, name: txt.ty || result.name || host, endpoint });
  }
  return printers;
}
