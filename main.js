// Electron main process: opens Hot Pot Go in its own window
const { app, BrowserWindow, Menu, protocol, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// On PCs with two graphics cards (e.g. Intel + NVIDIA) use the powerful one
app.commandLine.appendSwitch('force_high_performance_gpu');
// Self-test: keep drawing frames even when the window is covered or the screen is off
if (process.env.HOTPOT_SELFTEST) {
  ['disable-renderer-backgrounding', 'disable-background-timer-throttling', 'disable-backgrounding-occluded-windows']
    .forEach((sw) => app.commandLine.appendSwitch(sw));
}

// Own app:// protocol so the game can load its files (models/, textures/)
// with fetch(), which does not work with file://.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const served = { ok: [], failed: [] };   // for the self-test

// The saved game: restaurant.json in the user's data folder, with the save from before
// beside it as restaurant.backup.json. A self-test neither reads nor writes the player's
// save (HOTPOT_SAVE_DIR gives a test its own folder).
function saveDir() {
  if (process.env.HOTPOT_SAVE_DIR) return process.env.HOTPOT_SAVE_DIR;
  if (process.env.HOTPOT_SELFTEST) return null;
  return path.join(app.getPath('userData'), 'saves');
}
function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
}
function isSave(text) {
  try { return !!JSON.parse(text).state; } catch (e) { return false; }
}
// the input log: what the mouse and the keys did and what the game made of it (kept small)
let logLines = 0;
function serveLog() {
  ipcMain.on('debug:log', (event, text) => {
    if (process.env.HOTPOT_SELFTEST) return;
    try {
      const file = path.join(app.getPath('userData'), 'input-log.txt');
      if (++logLines % 500 === 1 && fs.existsSync(file) && fs.statSync(file).size > 1000000) fs.renameSync(file, file + '.old');   // (the size looked at now and then)
      fs.appendFile(file, new Date().toISOString().slice(11, 23) + ' ' + String(text).slice(0, 400).replace(/[\r\n]+/g, ' ') + '\n', () => {});
    } catch (e) {}
  });
}
function serveSaves() {
  ipcMain.on('save:read', (event) => {
    const dir = saveDir();
    event.returnValue = dir
      ? { main: readText(path.join(dir, 'restaurant.json')), backup: readText(path.join(dir, 'restaurant.backup.json')) }
      : { main: null, backup: null };
  });
  // A save the game could not read is not thrown away: it is put aside under another name.
  ipcMain.on('save:aside', (event) => {
    const dir = saveDir();
    try {
      if (dir) fs.renameSync(path.join(dir, 'restaurant.json'), path.join(dir, 'restaurant.unreadable.json'));
      event.returnValue = !!dir;
    } catch (e) { event.returnValue = false; }
  });
  // Written to a new file first and then renamed over the old one, so a crash in the
  // middle of writing never leaves a half-written save behind.
  ipcMain.on('save:write', (event, text, keepBackup) => {
    const dir = saveDir();
    if (!dir) { event.returnValue = false; return; }
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'restaurant.json'), fresh = file + '.new';
      fs.writeFileSync(fresh, text);
      const old = readText(file);
      if (keepBackup && old && isSave(old)) fs.writeFileSync(path.join(dir, 'restaurant.backup.json'), old);
      fs.renameSync(fresh, file);
      event.returnValue = true;
    } catch (e) {
      console.log('[save] Could not write the saved game: ' + e.message);
      event.returnValue = false;
    }
  });
}

function serveAppFiles() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(__dirname, decodeURIComponent(pathname)));
    if (!file.startsWith(__dirname + path.sep)) {
      served.failed.push(pathname);
      return new Response('Not found', { status: 404 });
    }
    const res = await net.fetch(pathToFileURL(file).toString());
    (res.ok ? served.ok : served.failed).push(pathname);
    return res;
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 450,
    backgroundColor: '#bfe3ff',
    // a self-test window takes no keys and does not come to the front, so nobody plays in it by mistake
    title: process.env.HOTPOT_SELFTEST ? 'Hot Pot Go – automatic test (closes by itself)' : 'Hot Pot Go',
    show: !process.env.HOTPOT_SELFTEST,
    focusable: !process.env.HOTPOT_SELFTEST,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.HOTPOT_SELFTEST) {
    win.on('page-title-updated', (event) => event.preventDefault());
    win.showInactive();
  }
  const query = (process.env.HOTPOT_QUERY || '') + (process.env.HOTPOT_SELFTEST ? (process.env.HOTPOT_QUERY ? '&' : '?') + 'selftest=1' : '');   // (a self-test skips the title screen)
  win.loadURL('app://game/index.html' + query);   // query: test settings only

  // F11 = full screen, F12 = developer tools (development only)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12' && !app.isPackaged) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Never open external pages in the game window
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  // In development: show errors from the game in the terminal
  if (!app.isPackaged) {
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') console.log(`[game:${e.level}] ${e.message}`);
    });
  }

  // Self-test (HOTPOT_SELFTEST=1): after loading, count what was loaded, then quit
  if (process.env.HOTPOT_SELFTEST) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const result = {
          models: served.ok.filter((p) => p.startsWith('/models/')).length,
          textures: served.ok.filter((p) => p.startsWith('/textures/')).length,
          failed: served.failed,
        };
        if (!process.env.HOTPOT_SELFTEST_NOPERF)
        // Performance: frames per second, draw calls and triangles per frame, graphics card in use
        result.perf = await win.webContents.executeJavaScript(`new Promise((done) => {
          const P = WebGL2RenderingContext.prototype, s = { calls: 0, tris: 0 };
          const wrap = (name, countArg, instArg) => { const f = P[name]; P[name] = function (...a) {
            s.calls++; s.tris += (a[countArg] / 3) * (instArg !== undefined ? a[instArg] : 1); return f.apply(this, a); }; };
          wrap('drawElements', 1); wrap('drawArrays', 2); wrap('drawElementsInstanced', 1, 4); wrap('drawArraysInstanced', 2, 3);
          let frames = 0; const t0 = performance.now();
          const tick = () => { frames++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else {
            const gl = document.createElement('canvas').getContext('webgl2'), dbg = gl.getExtension('WEBGL_debug_renderer_info');
            done({ fps: Math.round(frames / ((performance.now() - t0) / 1000)), callsPerFrame: Math.round(s.calls / frames),
                   trisPerFrame: Math.round(s.tris / frames), gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?' }); } };
          requestAnimationFrame(tick);
        })`);
        console.log('[selftest] ' + JSON.stringify(result));
        // Steps: HOTPOT_SELFTEST_STEPS='[{ js, step, wait, shot }, ...]' - run JavaScript in the game, advance the
        // frozen game clock by `step` seconds, wait `wait` ms, save a screenshot as <shot>.png in HOTPOT_SELFTEST_DIR
        if (process.env.HOTPOT_SELFTEST_STEPS && process.env.HOTPOT_SELFTEST_DIR) {
          const steps = JSON.parse(process.env.HOTPOT_SELFTEST_STEPS);
          for (const st of steps) {
            if (st.js) await win.webContents.executeJavaScript(st.js);
            if (st.step) {
              await win.webContents.executeJavaScript(`new Promise((done) => { const c = window.__hotpotClock; c.frozen = true; c.pending += ${Number(st.step)};
                const tick = () => (c.pending > 0 ? requestAnimationFrame(tick) : requestAnimationFrame(() => requestAnimationFrame(done))); tick(); })`);
            }
            if (st.wait) await new Promise((r) => setTimeout(r, st.wait));
            if (st.shot) {
              const img = await win.webContents.capturePage();
              require('fs').writeFileSync(path.join(process.env.HOTPOT_SELFTEST_DIR, st.shot + '.png'), img.toPNG());
            }
          }
        }
        // Views: HOTPOT_SELFTEST_VIEWS='[[x, z, yaw, pitch], ...]' and HOTPOT_SELFTEST_DIR
        if (process.env.HOTPOT_SELFTEST_VIEWS && process.env.HOTPOT_SELFTEST_DIR) {
          const views = JSON.parse(process.env.HOTPOT_SELFTEST_VIEWS);
          for (let i = 0; i < views.length; i++) {
            const [vx, vz, yaw, pitch, action] = views[i];   // optional action: JavaScript to run in the game first
            await win.webContents.executeJavaScript(`window.__hotpotView(${vx},${vz},${yaw},${pitch || 0})`);
            if (action) await win.webContents.executeJavaScript(action);
            await new Promise((r) => setTimeout(r, 900));
            console.log(`[view ${i + 1}] ` + JSON.stringify(await win.webContents.executeJavaScript('window.__hotpotCam && window.__hotpotCam()')));
            const img = await win.webContents.capturePage();
            require('fs').writeFileSync(path.join(process.env.HOTPOT_SELFTEST_DIR, `view${i + 1}.png`), img.toPNG());
          }
        }
        if (process.env.HOTPOT_SELFTEST_SHOT) {
          const img = await win.webContents.capturePage();
          require('fs').writeFileSync(process.env.HOTPOT_SELFTEST_SHOT, img.toPNG());
        }
        app.quit();
      }, Number(process.env.HOTPOT_SELFTEST_WAIT || 15000));
    });
  }
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  serveAppFiles();
  serveSaves();
  serveLog();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
