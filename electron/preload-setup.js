/**
 * preload-setup.js — 配置向导窗口的 preload
 * 只暴露配置向导需要的 IPC
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Backend 配置 ───
  backendVerifyProvider: (params) => ipcRenderer.invoke('backend-verify-provider', params),
  backendSaveProvider: (params) => ipcRenderer.invoke('backend-save-provider', params),

  // ─── ASR 配置 ───
  saveAsrConfig: (data) => ipcRenderer.invoke('save-asr-config', data),

  // ─── 启动宠物 ───
  launchPet: () => ipcRenderer.send('launch-pet'),
});
