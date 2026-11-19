// Electron-Hauptprozess: öffnet Hot Pot Go in einem eigenen Fenster
const { app, BrowserWindow, Menu, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Auf PCs mit zwei Grafikkarten (z. B. Intel + NVIDIA) die leistungsstarke nehmen
app.commandLine.appendSwitch('force_high_performance_gpu');

// Eigenes Protokoll app:// – damit kann das Spiel seine Dateien (models/, textures/)
// per fetch() laden, was mit file:// nicht geht.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const served = { ok: [], failed: [] };   // für den Selbsttest

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
    title: 'Hot Pot Go',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL('app://game/index.html');

  // F11 = Vollbild, F12 = Entwicklerwerkzeuge (nur im Entwicklungsmodus)
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

  // Keine externen Seiten im Spielfenster öffnen
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  // Im Entwicklungsmodus: Fehler aus dem Spiel im Terminal anzeigen
  if (!app.isPackaged) {
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') console.log(`[spiel:${e.level}] ${e.message}`);
    });
  }

  // Selbsttest (HOTPOT_SELFTEST=1): nach dem Laden zählen, was geladen wurde, dann beenden
  if (process.env.HOTPOT_SELFTEST) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const result = {
          models: served.ok.filter((p) => p.startsWith('/models/')).length,
          textures: served.ok.filter((p) => p.startsWith('/textures/')).length,
          failed: served.failed,
        };
        // Leistung: Bilder pro Sekunde, Zeichenaufrufe und Dreiecke pro Bild, benutzte Grafikkarte
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
        console.log('[selbsttest] ' + JSON.stringify(result));
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
