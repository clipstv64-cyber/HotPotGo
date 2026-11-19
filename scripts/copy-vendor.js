// Kopiert three.js (r128) aus node_modules nach vendor/three, damit das Spiel offline läuft.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'node_modules', 'three');
const dest = path.join(root, 'vendor', 'three');

const files = [
  ['build/three.min.js', 'three.min.js'],
  ['examples/js/loaders/GLTFLoader.js', 'GLTFLoader.js'],
  ['examples/js/libs/meshopt_decoder.js', 'meshopt_decoder.js'],
  ['LICENSE', 'LICENSE'],
];

fs.mkdirSync(dest, { recursive: true });
for (const [from, to] of files) {
  fs.copyFileSync(path.join(src, from), path.join(dest, to));
  console.log(`kopiert: ${from} -> vendor/three/${to}`);
}
