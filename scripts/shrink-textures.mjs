// Shrinks oversized textures in .glb models.
// Only models whose largest texture is above MAX are shrunk, all their
// textures by FACTOR (8192 -> 2048, 4096 -> 1024 with factor 4). Geometry stays as it is.
//
//   node scripts/shrink-textures.mjs models/k_stool.glb [more.glb ...]
//   options via environment variables: SHRINK_FACTOR (4), SHRINK_MAX (2048), SHRINK_QUALITY (90)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const FACTOR = Number(process.env.SHRINK_FACTOR || 4);
const MAX = Number(process.env.SHRINK_MAX || 2048);
const QUALITY = Number(process.env.SHRINK_QUALITY || 90);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const files = process.argv.slice(2);
if (!files.length) { console.error('Please name .glb files.'); process.exit(1); }

for (const file of files) {
  const before = fs.statSync(file).size;
  const doc = await io.read(file);
  // All textures of a model are treated alike: they are shrunk once the largest
  // is above MAX (so colour, normal and roughness maps stay matched).
  const textures = doc.getRoot().listTextures();
  const metas = await Promise.all(textures.map((t) => sharp(Buffer.from(t.getImage())).metadata()));
  const largest = Math.max(...metas.map((m) => Math.max(m.width, m.height)));
  if (largest <= MAX) { console.log(`${file}: largest texture ${largest}px – unchanged`); continue; }

  for (let i = 0; i < textures.length; i++) {
    const t = textures[i], m = metas[i];
    const w = Math.max(1, Math.round(m.width / FACTOR)), h = Math.max(1, Math.round(m.height / FACTOR));
    let img = sharp(Buffer.from(t.getImage())).resize(w, h, { kernel: 'lanczos3' });
    const mime = t.getMimeType();
    if (mime === 'image/webp') img = img.webp({ quality: QUALITY, effort: 6 });
    else if (mime === 'image/jpeg') img = img.jpeg({ quality: QUALITY, mozjpeg: true });
    else img = img.png({ compressionLevel: 9 });
    t.setImage(new Uint8Array(await img.toBuffer()));
    console.log(`  ${t.getName() || 'Textur ' + i}: ${m.width}x${m.height} -> ${w}x${h}`);
  }
  await io.write(file, doc);
  const after = fs.statSync(file).size;
  console.log(`${file}: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
}
