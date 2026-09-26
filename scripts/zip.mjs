/**
 * Minimal ZIP subsetting: copy chosen entries of an existing archive into a
 * new one without recompressing. Enough for python_stdlib.zip (no ZIP64, no
 * data descriptors, no encryption) — anything else fails loudly.
 */

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

function findEocd(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("zip: end of central directory not found");
}

/** @returns {{name: string, compressedSize: number, size: number, cen: Buffer, local: Buffer}[]} */
export function readZip(buf) {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`zip: bad central header at ${p}`);
    const flags = buf.readUInt16LE(p + 8);
    if (flags & 0x9) throw new Error("zip: encrypted entries or data descriptors are not supported");
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const cen = buf.subarray(p, p + 46 + nameLen + extraLen + commentLen);
    if (buf.readUInt32LE(localOffset) !== LOC_SIG) throw new Error(`zip: bad local header for ${name}`);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const local = buf.subarray(localOffset, localOffset + 30 + lNameLen + lExtraLen + compressedSize);
    entries.push({ name, compressedSize, size, cen, local });
    p += cen.length;
  }
  return entries;
}

/** Build a new archive from entries returned by readZip(). */
export function writeZip(entries) {
  const locals = [];
  const cens = [];
  let offset = 0;
  for (const e of entries) {
    locals.push(e.local);
    const cen = Buffer.from(e.cen);
    cen.writeUInt32LE(offset, 42);
    cens.push(cen);
    offset += e.local.length;
  }
  const cenSize = cens.reduce((n, c) => n + c.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cenSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...cens, eocd]);
}
