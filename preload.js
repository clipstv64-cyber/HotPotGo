// Bridge between the game page and the program around it: the saved game is a file in
// the user's own data folder, which only the main process (main.js) may read and write.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hotpotSave', {
  // -> { main: text or null, backup: text or null }
  read: () => ipcRenderer.sendSync('save:read'),
  // text: the saved game; keepBackup: keep the save that was there before as the backup
  write: (text, keepBackup) => ipcRenderer.sendSync('save:write', String(text), !!keepBackup),
  // the save could not be read: keep it under another name instead of overwriting it
  setAside: () => ipcRenderer.sendSync('save:aside'),
});
