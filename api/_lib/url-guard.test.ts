import { describe, it, expect } from 'vitest';
import { isBlockedAddress, isAllowedImageType, magicBytesMatch } from './url-guard';

// The URL import lane is the only place in the app that fetches a host the user chose.
// Everything else is pinned to a Meta domain, so these checks are the entire attack surface
// for that lane — each bypass below is a real, documented one.

describe('isBlockedAddress — IPv4', () => {
  it('blocks loopback', () => {
    expect(isBlockedAddress('127.0.0.1', 4)).toBe(true);
    expect(isBlockedAddress('127.255.255.254', 4)).toBe(true);
  });

  it('blocks the cloud metadata endpoint', () => {
    // 169.254.169.254 is how an SSRF becomes credential theft on AWS/GCP/Azure.
    expect(isBlockedAddress('169.254.169.254', 4)).toBe(true);
  });

  it('blocks every RFC1918 range', () => {
    expect(isBlockedAddress('10.0.0.1', 4)).toBe(true);
    expect(isBlockedAddress('172.16.0.1', 4)).toBe(true);
    expect(isBlockedAddress('172.31.255.255', 4)).toBe(true);
    expect(isBlockedAddress('192.168.1.1', 4)).toBe(true);
  });

  it('blocks CGNAT, benchmarking, multicast and reserved space', () => {
    expect(isBlockedAddress('100.64.0.1', 4)).toBe(true);
    expect(isBlockedAddress('198.18.0.1', 4)).toBe(true);
    expect(isBlockedAddress('224.0.0.1', 4)).toBe(true);
    expect(isBlockedAddress('240.0.0.1', 4)).toBe(true);
    expect(isBlockedAddress('0.0.0.0', 4)).toBe(true);
  });

  it('allows ordinary public addresses', () => {
    expect(isBlockedAddress('8.8.8.8', 4)).toBe(false);
    expect(isBlockedAddress('1.1.1.1', 4)).toBe(false);
    expect(isBlockedAddress('172.32.0.1', 4)).toBe(false);  // just outside 172.16/12
    expect(isBlockedAddress('192.169.0.1', 4)).toBe(false); // just outside 192.168/16
  });

  it('blocks an unparseable address rather than assuming it is safe', () => {
    expect(isBlockedAddress('not-an-ip', 4)).toBe(true);
    expect(isBlockedAddress('999.1.1.1', 4)).toBe(true);
    expect(isBlockedAddress('10.1.1', 4)).toBe(true);
  });
});

describe('isBlockedAddress — IPv6', () => {
  it('blocks loopback and unspecified', () => {
    expect(isBlockedAddress('::1', 6)).toBe(true);
    expect(isBlockedAddress('::', 6)).toBe(true);
  });

  it('blocks unique-local, link-local and multicast', () => {
    expect(isBlockedAddress('fc00::1', 6)).toBe(true);
    expect(isBlockedAddress('fd12:3456::1', 6)).toBe(true);
    expect(isBlockedAddress('fe80::1', 6)).toBe(true);
    expect(isBlockedAddress('ff02::1', 6)).toBe(true);
  });

  it('UNWRAPS IPv4-mapped addresses and re-checks them as IPv4', () => {
    // Without this every IPv4 rule above is bypassed by writing the address in v6 form.
    expect(isBlockedAddress('::ffff:127.0.0.1', 6)).toBe(true);
    expect(isBlockedAddress('::ffff:169.254.169.254', 6)).toBe(true);
    expect(isBlockedAddress('::ffff:10.0.0.1', 6)).toBe(true);
    expect(isBlockedAddress('::ffff:8.8.8.8', 6)).toBe(false);
  });

  it('ignores a zone index when classifying', () => {
    expect(isBlockedAddress('fe80::1%eth0', 6)).toBe(true);
  });

  it('allows ordinary public addresses', () => {
    expect(isBlockedAddress('2606:4700:4700::1111', 6)).toBe(false);
  });
});

describe('isAllowedImageType', () => {
  it('accepts the four supported image types', () => {
    expect(isAllowedImageType('image/jpeg')).toBe(true);
    expect(isAllowedImageType('image/png')).toBe(true);
    expect(isAllowedImageType('image/webp')).toBe(true);
    expect(isAllowedImageType('image/gif')).toBe(true);
  });

  it('tolerates parameters and casing', () => {
    expect(isAllowedImageType('image/jpeg; charset=binary')).toBe(true);
    expect(isAllowedImageType('IMAGE/PNG')).toBe(true);
  });

  it('rejects everything else, including missing types', () => {
    expect(isAllowedImageType('text/html')).toBe(false);
    expect(isAllowedImageType('image/svg+xml')).toBe(false); // SVG carries script
    expect(isAllowedImageType('application/pdf')).toBe(false);
    expect(isAllowedImageType(null)).toBe(false);
    expect(isAllowedImageType('')).toBe(false);
  });
});

describe('magicBytesMatch', () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const HTML = new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43]); // "<!DOC"

  it('accepts bytes that match the declared type', () => {
    expect(magicBytesMatch(JPEG, 'image/jpeg')).toBe(true);
    expect(magicBytesMatch(PNG, 'image/png')).toBe(true);
  });

  it('rejects a lying Content-Type header', () => {
    // The header is a claim; the bytes are the evidence.
    expect(magicBytesMatch(HTML, 'image/jpeg')).toBe(false);
    expect(magicBytesMatch(JPEG, 'image/png')).toBe(false);
  });

  it('rejects a truncated body rather than reading past its end', () => {
    expect(magicBytesMatch(new Uint8Array([0xff]), 'image/jpeg')).toBe(false);
    expect(magicBytesMatch(new Uint8Array([]), 'image/png')).toBe(false);
  });

  it('rejects a type with no known signature', () => {
    expect(magicBytesMatch(JPEG, 'image/svg+xml')).toBe(false);
  });
});
