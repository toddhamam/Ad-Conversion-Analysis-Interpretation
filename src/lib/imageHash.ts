// SHA-256 of an image payload, used to dedupe every library table.
//
// Lives in lib/ because it is generic: it was defined in inspirationLibraryApi.ts, which meant
// the Showcase Library had to import from the Inspiration Library to hash a screenshot — a
// dependency between two unrelated features created purely by where the function happened to
// sit. Any future library gets it from here instead.

/**
 * Hash the FULL normalized base64.
 *
 * Deliberately not the swipe library's `.slice(0, 1000)` shortcut: for images from the same
 * encoder at the same dimensions those leading bytes are the header, APPn segments and
 * quantization tables, which are identical across genuinely different pictures.
 */
export async function computeImageHash(base64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
