'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installer', {
  scanPorts:     ()          => ipcRenderer.invoke('scan-ports'),
  installSkills: (opts)      => ipcRenderer.invoke('install-skills', opts),
  openUrl:       (url)       => ipcRenderer.invoke('open-url', url),
  launchPet:     ()          => ipcRenderer.send('launch-pet'),
  quit:          ()          => ipcRenderer.send('quit'),
  // 调试：模拟特定扫描结果
  debugScanState: (state)    => ipcRenderer.invoke('debug-scan-state', state),
});
