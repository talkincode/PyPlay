/**
 * Share links carry the program in the URL fragment (never sent to a
 * server): #code=<base64url(deflate-raw(utf8))>.
 */
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function encodeShare(code: string): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(code), new CompressionStream("deflate-raw"));
  return `#code=${toBase64Url(packed)}`;
}

export async function decodeShare(hash: string): Promise<string | null> {
  const m = hash.match(/^#code=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const raw = await pipe(fromBase64Url(m[1] as string), new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(raw);
}
