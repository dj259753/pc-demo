const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meetingNotesUI', {
  onUpdate: (callback) => ipcRenderer.on('meeting-notes-window-update', (_, payload) => callback(payload || {})),
  sendCommand: (command) => ipcRenderer.send('meeting-notes-window-command', { command }),
  toggleMinimize: (minimized) => ipcRenderer.send('meeting-notes-window-minimize', { minimized: !!minimized }),
});

