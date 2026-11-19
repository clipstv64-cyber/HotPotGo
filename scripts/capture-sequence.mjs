// Test tool: plays a scenario in the game with a frozen, stepped clock and puts the
// screenshots on one contact sheet, to check animations frame by frame.
//
//   node scripts/capture-sequence.mjs <scenario.json> <out.png>
//
// scenario.json: { "query": "?a=1" (optional), "cols": 3, "width": 420,
//                  "steps": [{ "js": "...", "step": 0.1, "wait": 0, "shot": "name" }, ...] }
// js runs in the game (window.__hotpotGameplay, __hotpotView, __hotpotCamOverride, __hotpotKeys ...),
// step advances the game time in seconds, shot saves a frame (its name is the label on the sheet).
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const [scenarioFile, outFile] = process.argv.slice(2);
if (!scenarioFile || !outFile) { console.error('usage: capture-sequence.mjs scenario.json out.png'); process.exit(1); }
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sc = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hotpot-seq-'));
const electron = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

const run = spawnSync(electron, ['.'], {
  cwd: root, encoding: 'utf8', timeout: 240000,
  env: { ...process.env, HOTPOT_SELFTEST: '1', HOTPOT_SELFTEST_NOPERF: '1', HOTPOT_SELFTEST_WAIT: String(sc.loadWait || 12000),
         HOTPOT_SELFTEST_DIR: dir, HOTPOT_SELFTEST_STEPS: JSON.stringify(sc.steps), HOTPOT_QUERY: sc.query || '' },
});
for (const line of (run.stdout || '').split('\n')) if (/game:error|LOG /.test(line)) console.log(line.trim());

const shots = sc.steps.filter((s) => s.shot).map((s) => s.shot);
const cols = sc.cols || 3, w = sc.width || 420;
const tiles = [];
for (const name of shots) {
  const file = path.join(dir, name + '.png');
  if (!fs.existsSync(file)) { console.error('missing frame: ' + name); continue; }
  let img = sharp(file);
  if (sc.crop) img = img.extract(sc.crop);   // { left, top, width, height } in window pixels
  const buf = await img.resize({ width: w }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  const label = Buffer.from(`<svg width="${w}" height="20"><rect width="100%" height="100%" fill="rgba(0,0,0,0.6)"/><text x="5" y="14" font-family="Arial" font-size="12" fill="#fff">${name}</text></svg>`);
  tiles.push({ buf: await sharp(buf).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer(), h: meta.height });
}
if (!tiles.length) { console.error('no frames captured'); process.exit(1); }
const h = tiles[0].h, rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#222' } })
  .composite(tiles.map((t, i) => ({ input: t.buf, left: (i % cols) * w, top: Math.floor(i / cols) * h })))
  .png().toFile(outFile);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${tiles.length} frames -> ${outFile}`);
