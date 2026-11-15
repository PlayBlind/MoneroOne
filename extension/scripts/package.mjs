import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const crc = data => {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc(Buffer.concat([name, data])), data.length + 8);
  return output;
}
const size = 128, pixels = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const offset = y * (size * 4 + 1) + 1 + x * 4;
  const circle = (x - 64) ** 2 + (y - 64) ** 2 < 54 ** 2;
  const m = x > 30 && x < 98 && y > 39 && y < 88 && (x < 42 || x > 86 || Math.abs(y - (39 + Math.min(x - 42, 86 - x))) < 7);
  pixels.set(m ? [255, 255, 255, 255] : circle ? [247, 112, 43, 255] : [20, 22, 26, 255], offset);
}
const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
const icon = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
await mkdir('public', { recursive: true });
await writeFile('public/icon.png', icon);
await writeFile('dist/icon.png', icon);
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 required');
console.log('Built standalone Chrome extension in extension/dist. No remote code or companion app required.');
