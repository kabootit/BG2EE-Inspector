/**
 * Downloading a pinned file.
 *
 * The bytes are checked against the SHA-256 published upstream before anything
 * is written, unpacked or run; a mismatch throws and leaves nothing behind
 * (docs/rules/security-first.md).
 */
import { sha256Hex } from "../shared/sha256.ts";
import type { Download } from "../shared/config.ts";

export type Fetch = (url: string) => Promise<Response>;

/** Fetch `release.url` and return its bytes, or throw if the download or the checksum fails. */
export async function downloadVerified(
  release: Download,
  fetchFn: Fetch = fetch,
): Promise<Uint8Array> {
  const response = await fetchFn(release.url);
  if (!response.ok) {
    throw new Error(`download failed: HTTP ${response.status} for ${release.url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = await sha256Hex(bytes);
  if (actual !== release.sha256) {
    throw new Error(
      `SHA-256 mismatch for ${release.url}\n  expected ${release.sha256} (${release.checksumSource})\n  got      ${actual}\nNothing was written.`,
    );
  }
  return bytes;
}
