// One-off conversion (already done): base64 assets (assets/*.js and inline in index.html)
// become real files in models/ and textures/; index.html loads them by URL.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const modelsDir = path.join(root, 'models');
const texDir = path.join(root, 'textures');
fs.mkdirSync(modelsDir, { recursive: true });
fs.mkdirSync(texDir, { recursive: true });

let html = fs.readFileSync(htmlPath, 'utf8');
if (!/_BASE64 = "/.test(html)) {
  console.log('index.html is already converted – nothing to do.');
  process.exit(0);
}

let total = 0;
function save(dir, file, b64) {
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(path.join(dir, file), buf);
  total += buf.length;
  console.log(`${path.basename(dir)}/${file}  ${(buf.length / 1048576).toFixed(2)} MB`);
}

// 1) assets/*.js in the order of the <script> tags (parts are joined)
const tagRe = /^<script src="assets\/([\w]+)\.js"><\/script>\r?\n/gm;
const assetFiles = [...html.matchAll(tagRe)].map((m) => m[1]);
const partRe = /window\.(__ASSET_\w+)\s*=\s*(?:\(window\.\1 \|\| ""\) \+ )?"([A-Za-z0-9+/=]*)"/g;
const assets = {};
for (const f of assetFiles) {
  const src = fs.readFileSync(path.join(root, 'assets', f + '.js'), 'utf8');
  let n = 0;
  for (const m of src.matchAll(partRe)) { assets[m[1]] = (assets[m[1]] || '') + m[2]; n++; }
  if (n !== 1) throw new Error(`assets/${f}.js: ${n} assignments found, expected 1`);
}
const kparts = {};
for (const [v, b64] of Object.entries(assets)) {
  const name = v.replace('__ASSET_', '').toLowerCase();   // e.g. k_block_lo, biker
  save(modelsDir, name + '.glb', b64);
  if (name.startsWith('k_')) kparts[name.slice(2)] = ['models/' + name + '.glb'];
}
// 2) replaces the asset script tags with a list of the kitchen models
let first = true;
html = html.replace(tagRe, () => {
  if (!first) return '';
  first = false;
  return `<script>window.__KPARTS = ${JSON.stringify(kparts)};</script>\n`;
});

// 3) kitchen textures (window.__KTEX)
html = html.replace(/<script>window\.__KTEX = (\{.*\});<\/script>/, (_, json) => {
  const obj = JSON.parse(json), out = {};
  for (const [k, url] of Object.entries(obj)) {
    const m = /^data:image\/(\w+);base64,(.*)$/.exec(url);
    const file = `k_${k}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    save(texDir, file, m[2]);
    out[k] = 'textures/' + file;
  }
  return `<script>window.__KTEX = ${JSON.stringify(out)};</script>`;
});

// 4) inline models and textures in index.html
html = html.replace(/var (\w+)_GLB_BASE64 = "([A-Za-z0-9+/=]+)";/g, (_, n, b64) => {
  const file = n.toLowerCase() + '.glb';
  save(modelsDir, file, b64);
  return `var ${n}_GLB_URL = "models/${file}";`;
});
html = html.replace(/var (\w+)_GLB_BASE64 = window\.__ASSET_(\w+);/g,
  (_, n, a) => `var ${n}_GLB_URL = "models/${a.toLowerCase()}.glb";`);
html = html.replace(/var (\w+)_BASE64 = "([A-Za-z0-9+/=]+)";/g, (_, n, b64) => {
  const file = n.toLowerCase() + '.jpg';
  save(texDir, file, b64);
  return `var ${n}_URL = "textures/${file}";`;
});

// 5) loading code: load files instead of decoding base64
function must(from, to) {
  if (!html.includes(from)) throw new Error('Not found: ' + from);
  html = html.split(from).join(to);
}
must("'data:image/jpeg;base64,' + ", '');
html = html.replace(/texLoader\.load\((\w+)_BASE64\)/g, 'texLoader.load($1_URL)');
html = html.replace(/b64: (\w+)_GLB_BASE64/g, 'url: $1_GLB_URL');
html = html.replace(/loadFurniture\((\w+)_GLB_BASE64,/g, 'loadFurniture($1_GLB_URL,');
must('function loadFurniture(b64, height, done){', 'function loadFurniture(url, height, done){');
must("furnLoader.parse(base64ToArrayBuffer(b64), '',", 'loadGLB(furnLoader, url,');
must("furnLoader.parse(base64ToArrayBuffer(cfg.b64), '',", 'loadGLB(furnLoader, cfg.url,');
must("var buffer = base64ToArrayBuffer(CHEF_GLB_BASE64);\n    loader.parse(buffer, '',", 'loadGLB(loader, CHEF_GLB_URL,');
must('  function base64ToArrayBuffer(base64){',
  `  // loads a .glb file and hands it to the GLTFLoader (same callbacks as loader.parse)
  function loadGLB(loader, url, onLoad, onError){
    onError = onError || function(e){ console.error(e); };
    fetch(url).then(function(r){ if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); })
      .then(function(buf){ loader.parse(buf, '', onLoad, onError); }).catch(onError);
  }

  function base64ToArrayBuffer(base64){`);

if (/_BASE64\b/.test(html.replace(/base64ToArrayBuffer|base64\)/g, ''))) {
  const left = [...html.matchAll(/\w*_BASE64\b/g)].map((m) => m[0]);
  throw new Error('Base64 references left: ' + [...new Set(left)].join(', '));
}

fs.writeFileSync(htmlPath, html);
console.log(`\nindex.html: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
console.log(`binary data in total: ${(total / 1048576).toFixed(1)} MB`);
