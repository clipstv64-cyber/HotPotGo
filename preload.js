// Bridge between the game page and the program around it: the saved game is a file in
// the user's own data folder, which only the main process (main.js) may read and write.
const { contextBridge, ipcRenderer } = require('electron');

// a line for the input log (main.js writes it to input-log.txt in the user's data folder)
contextBridge.exposeInMainWorld('hotpotLog', { log: (text) => ipcRenderer.send('debug:log', String(text).slice(0, 400)) });

// the game page loaded again (back to the title screen)
contextBridge.exposeInMainWorld('hotpotApp', { restart: () => ipcRenderer.send('app:restart') });

contextBridge.exposeInMainWorld('hotpotSave', {
  // -> { main: text or null, backup: text or null }
  read: () => ipcRenderer.sendSync('save:read'),
  // text: the saved game; keepBackup: keep the save that was there before as the backup
  write: (text, keepBackup) => ipcRenderer.sendSync('save:write', String(text), !!keepBackup),
  // the save could not be read: keep it under another name instead of overwriting it
  setAside: () => ipcRenderer.sendSync('save:aside'),
});
