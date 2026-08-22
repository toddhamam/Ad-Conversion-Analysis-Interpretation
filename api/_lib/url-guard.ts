/**
 * SSRF defence for the arbitrary-URL image import lane.
 *
 * This is the one place in the app that fetches a host the user chose. Everything else is
 * pinned to a Meta domain, so this file is the entire new attack surface for that lane and is
 * written to be read by someone auditing it, not just by someone using it.
 *
 * THE THREAT: an authenticated endpoint that fetches a user-supplied URL is an open proxy into
 * whatever the serverless function can reach — cloud metadata endpoints, internal services,
 * anything on a private network. The defences below are layered because any single one of them
 * has a known bypass.
 */

import { lookup as dnsLookup } from 'node:dns/promises';

export interface UrlGuardResult {
  ok: boolean;
  /** Generic, safe-to-return reason. Never includes upstream response detail. */
  reason?: string;
  /** The vetted IP the connection must be pinned to. */
  pinnedAddress?: string;
  family?: 4 | 6;
}

/** Feature flag. Off unless explicitly enabled — see the deferral note in the plan. */
export function isUrlImportEnabled(): boolean {
  return process.env.ENABLE_URL_IMPORT === 'true';
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Magic bytes, because a Content-Type header is a claim, not evidence. */
const MAGIC_BYTES: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WEBP is RIFF....WEBP — the middle four bytes are the length, so they are not checked.
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

// ─── IP range checks ─────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

/** CIDR blocks that must never be reachable through this endpoint. */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],        // "this network"
  ['10.0.0.0', 8],       // RFC1918
  ['100.64.0.0', 10],    // CGNAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local — includes 169.254.169.254, the cloud metadata endpoint
  ['172.16.0.0', 12],    // RFC1918
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.168.0.0', 16],   // RFC1918
  ['198.18.0.0', 15],    // benchmarking
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved
];

function isBlockedIPv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // unparseable is not provably safe
  for (const [network, bits] of BLOCKED_V4) {
    const base = ipv4ToInt(network);
    if (base === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((value & mask) === (base & mask)) return true;
  }
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split('%')[0]; // drop any zone index

  // IPv4-mapped (::ffff:a.b.c.d) must be UNWRAPPED and re-checked as IPv4, or every v4
  // blocklist entry above is trivially bypassed by writing the address in v6 form.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);

  if (normalized === '::' || normalized === '::1') return true;         // unspecified, loopback
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;               // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;               // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(normalized)) return true;                  // ff00::/8 multicast
  return false;
}

export function isBlockedAddress(address: string, family: number): boolean {
  return family === 6 ? isBlockedIPv6(address) : isBlockedIPv4(address);
}

// ─── URL validation ──────────────────────────────────────────────────────────

/**
 * Validate a user-supplied URL and resolve it to a single vetted IP.
 *
 * Returns the address so the caller can PIN the connection to it. Our lookup and the HTTP
 * client's lookup are two separate resolutions, and an attacker-controlled short-TTL record
 * can differ between them (DNS rebinding). Validating here and connecting to whatever DNS
 * says later would be a check with no teeth.
 */
export async function validateExternalUrl(rawUrl: string): Promise<UrlGuardResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (url.protocol !== 'https:') return { ok: false, reason: 'Only HTTPS URLs are allowed' };

  // Credentials in a URL are a redirect/parsing-confusion vector and have no legitimate use here.
  if (url.username || url.password) return { ok: false, reason: 'URLs with credentials are not allowed' };

  // Non-standard ports are how internal services get reached.
  if (url.port && url.port !== '443') return { ok: false, reason: 'Only port 443 is allowed' };

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dnsLookup(url.hostname, { all: true });
  } catch {
    return { ok: false, reason: 'Could not resolve that host' };
  }

  if (addresses.length === 0) return { ok: false, reason: 'Could not resolve that host' };

  // Reject if ANY resolved address is blocked. A host that resolves to both a public and a
  // private address is a rebinding attempt, not a coincidence.
  for (const entry of addresses) {
    if (isBlockedAddress(entry.address, entry.family)) {
      return { ok: false, reason: 'That host is not allowed' };
    }
  }

  const first = addresses[0];
  return {
    ok: true,
    pinnedAddress: first.address,
    family: first.family === 6 ? 6 : 4,
  };
}

// ─── Content validation ──────────────────────────────────────────────────────

export function isAllowedImageType(contentType: string | null): boolean {
  if (!contentType) return false;
  return ALLOWED_IMAGE_TYPES.has(contentType.split(';')[0].trim().toLowerCase());
}

/** Confirm the bytes agree with the declared type. A header alone is not evidence. */
export function magicBytesMatch(buffer: Uint8Array, contentType: string): boolean {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const signature = MAGIC_BYTES.find(m => m.mime === mime);
  if (!signature) return false;
  if (buffer.length < signature.bytes.length) return false;
  return signature.bytes.every((byte, i) => buffer[i] === byte);
}

/**
 * Read a response body with a hard byte ceiling.
 *
 * `content-length` is a hint the server may omit or lie about, so the only reliable limit is
 * counting bytes as they arrive and aborting when the count is exceeded.
 */
export async function readCapped(
  response: Response,
  maxBytes: number = MAX_IMAGE_BYTES
): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export { MAX_REDIRECTS };
