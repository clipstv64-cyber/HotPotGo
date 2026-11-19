// Makes a Meshy model game-ready: fewer triangles, smaller textures (WebP),
// meshopt-compressed geometry.
//
//   node scripts/optimize-model.mjs <in.glb> <out.glb> [triangles=30000] [textureSize=1024]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const [input, output, trisArg, texArg] = process.argv.slice(2);
if (!input || !output) { console.error('usage: optimize-model.mjs in.glb out.glb [triangles] [textureSize]'); process.exit(1); }
const TARGET = Number(trisArg || 30000), TEX = Number(texArg || 1024);

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

function countTris(doc){
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()){
    const idx = p.getIndices(); t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return Math.round(t);
}

const doc = await io.read(input);
const before = countTris(doc);
await doc.transform(weld());
const ratio = Math.min(1, TARGET / before);
if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }));
await doc.transform(
  dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 88 }),
  reorder({ encoder: MeshoptEncoder }),
  quantize()
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);
console.log(`${input} -> ${output}: ${before} -> ${countTris(doc)} triangles, ${(fs.statSync(input).size / 1048576).toFixed(1)} MB -> ${(fs.statSync(output).size / 1048576).toFixed(2)} MB`);
