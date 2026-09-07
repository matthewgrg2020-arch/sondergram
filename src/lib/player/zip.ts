const CRC_TABLE = new Uint32Array(256);

for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, value, true);
  return b;
}

function u32(value: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value, true);
  return b;
}

function encodeName(name: string) {
  return new TextEncoder().encode(name);
}

export function zipBlobs(files: { name: string; data: Blob }[]): Promise<Blob> {
  return Promise.all(files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.data.arrayBuffer()) }))).then(
    (entries) => {
      const locals: Uint8Array[] = [];
      const centrals: Uint8Array[] = [];
      let offset = 0;
      for (const entry of entries) {
        const name = encodeName(entry.name);
        const crc = crc32(entry.bytes);
        const size = entry.bytes.length;
        const local = [
          u32(0x04034b50),
          u16(20),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          u32(crc),
          u32(size),
          u32(size),
          u16(name.length),
          u16(0),
          name,
          entry.bytes,
        ];
        const localBuf = concat(local);
        const central = concat([
          u32(0x02014b50),
          u16(20),
          u16(20),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          u32(crc),
          u32(size),
          u32(size),
          u16(name.length),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          u32(0),
          u32(offset),
          name,
        ]);
        locals.push(localBuf);
        centrals.push(central);
        offset += localBuf.length;
      }
      const centralStart = offset;
      const centralBuf = concat(centrals);
      const end = concat([
        u32(0x06054b50),
        u16(0),
        u16(0),
        u16(entries.length),
        u16(entries.length),
        u32(centralBuf.length),
        u32(centralStart),
        u16(0),
      ]);
      return new Blob([concat([...locals, centralBuf, end])], { type: "application/zip" });
    },
  );
}

export async function unzipBlobs(blob: Blob): Promise<{ name: string; data: Blob }[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files: { name: string; data: Blob }[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compressed;
    if (dataEnd > bytes.length) break;
    if (method === 0 && name) {
      const slice = bytes.subarray(dataStart, dataEnd);
      const copy = new Uint8Array(slice.byteLength);
      copy.set(slice);
      files.push({ name, data: new Blob([copy]) });
    }
    offset = dataEnd;
  }
  return files;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
