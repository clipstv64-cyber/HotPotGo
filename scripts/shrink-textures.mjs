// Verkleinert übergroße Texturen in .glb-Modellen.
// Nur Texturen, die größer als MAX sind, werden um FACTOR verkleinert
// (8192 -> 2048, 4096 -> 1024 bei Faktor 4). Geometrie bleibt unverändert.
//
//   node scripts/shrink-textures.mjs models/k_stool.glb [weitere.glb ...]
//   Optionen per Umgebungsvariable: SHRINK_FACTOR (4), SHRINK_MAX (2048), SHRINK_QUALITY (90)
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
if (!files.length) { console.error('Bitte .glb-Dateien angeben.'); process.exit(1); }

for (const file of files) {
  const before = fs.statSync(file).size;
  const doc = await io.read(file);
  // Alle Texturen eines Modells werden gleich behandelt: verkleinert wird,
  // sobald die größte über MAX liegt (so passen Farbe, Normal- und Rauheitskarte zusammen).
  const textures = doc.getRoot().listTextures();
  const metas = await Promise.all(textures.map((t) => sharp(Buffer.from(t.getImage())).metadata()));
  const largest = Math.max(...metas.map((m) => Math.max(m.width, m.height)));
  if (largest <= MAX) { console.log(`${file}: größte Textur ${largest}px – unverändert`); continue; }

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
