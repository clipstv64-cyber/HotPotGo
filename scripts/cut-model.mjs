// Cuts a part out of a model: keeps only the triangles whose middle fulfils a condition,
// then packs the result like optimize-model.mjs does.
//
//   node scripts/cut-model.mjs <in.glb> <out.glb> "<condition on x, y, z>" [triangles=20000] [textureSize=1024] [largest]
//
// "largest" also throws away loose bits: only the biggest connected piece is kept.
//
// x, y, z are the triangle's middle in the model's own units (see the bounding box that
// is printed). Example: the top crate of a stack   "y > 0.35"
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress, reorder, quantize, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const [input, output, cond, trisArg, texArg, largest] = process.argv.slice(2);
if (!input || !output || !cond) { console.error('usage: cut-model.mjs in.glb out.glb "<condition>" [triangles] [textureSize]'); process.exit(1); }
const TARGET = Number(trisArg || 20000), TEX = Number(texArg || 1024);
const keep = new Function('x', 'y', 'z', 'return (' + cond + ');');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
let before = 0, after = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], out = [];
  for (let t = 0; t < idx.length; t += 3) {
    pos.getElement(idx[t], a); pos.getElement(idx[t + 1], b); pos.getElement(idx[t + 2], c);
    if (keep((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3)) out.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  before += idx.length / 3;
  if (largest) {
    // connected pieces: triangles that share a corner (at the same place) belong together
    const parent = new Map(), find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); parent.set(k, r); return r; };
    const key = (i) => { pos.getElement(i, a); return Math.round(a[0] * 4000) + ',' + Math.round(a[1] * 4000) + ',' + Math.round(a[2] * 4000); };
    const keys = [];
    for (let t = 0; t < out.length; t += 3) {
      const k = [key(out[t]), key(out[t + 1]), key(out[t + 2])]; keys.push(k[0]);
      for (const q of k) if (!parent.has(q)) parent.set(q, q);
      parent.set(find(k[0]), find(k[1])); parent.set(find(k[1]), find(k[2]));
    }
    const count = new Map(); let best = null;
    for (const k of keys) { const r = find(k), c = (count.get(r) || 0) + 1; count.set(r, c); if (!best || c > count.get(best)) best = r; }
    const kept = [];
    for (let t = 0; t < out.length; t += 3) if (find(keys[t / 3]) === best) kept.push(out[t], out[t + 1], out[t + 2]);
    out.length = 0; for (const v of kept) out.push(v);
  }
  after += out.length / 3;
  prim.getIndices().setArray(new Uint32Array(out));
  compactPrimitive(prim);
}
if (!after) { console.error('nothing left: the condition keeps no triangle'); process.exit(1); }
await doc.transform(weld());
const ratio = Math.min(1, TARGET / after);
if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }));
await doc.transform(dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 88 }),
  reorder({ encoder: MeshoptEncoder }), quantize());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);
console.log(`${input} -> ${output}: kept ${after} of ${before} triangles, ${(fs.statSync(output).size / 1048576).toFixed(2)} MB`);
