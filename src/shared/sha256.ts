/** SHA-256 as lowercase hex, using the built-in Web Crypto API. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Web Crypto wants a buffer backed by a plain ArrayBuffer; copying gives one whatever the input.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
