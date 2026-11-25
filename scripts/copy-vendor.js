// Copies three.js (r128) from node_modules to vendor/three so the game runs offline.
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
  console.log(`copied: ${from} -> vendor/three/${to}`);
}

// the physics (things fall, tip over and come to rest): cannon-es, an ES module
const cSrc = path.join(root, 'node_modules', 'cannon-es'), cDest = path.join(root, 'vendor', 'cannon');
fs.mkdirSync(cDest, { recursive: true });
for (const [from, to] of [['dist/cannon-es.js', 'cannon-es.js'], ['LICENSE', 'LICENSE']]) {
  fs.copyFileSync(path.join(cSrc, from), path.join(cDest, to));
  console.log('copied: cannon-es/' + from + ' -> vendor/cannon/' + to);
}
