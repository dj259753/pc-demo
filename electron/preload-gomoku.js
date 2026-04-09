const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  socialBootstrap: () => ipcRenderer.invoke('social-bootstrap'),
  socialGetProfile: () => ipcRenderer.invoke('social-get-profile'),
  socialUpsertProfile: (payload) => ipcRenderer.invoke('social-upsert-profile', payload || {}),
  socialGetFriends: () => ipcRenderer.invoke('social-get-friends'),
  socialSendFriendRequest: (payload) => ipcRenderer.invoke('social-send-friend-request', payload || {}),
  socialRespondFriendRequest: (payload) => ipcRenderer.invoke('social-respond-friend-request', payload || {}),
  socialGetPresence: () => ipcRenderer.invoke('social-get-presence'),
  socialSetPresence: (payload) => ipcRenderer.invoke('social-set-presence', payload || {}),
  socialHeartbeat: (payload) => ipcRenderer.invoke('social-heartbeat', payload || {}),
  socialSetFriendPresence: (payload) => ipcRenderer.invoke('social-set-friend-presence', payload || {}),
  socialCreateVisitRoom: (payload) => ipcRenderer.invoke('social-create-visit-room', payload || {}),
  socialLeaveVisitRoom: (payload) => ipcRenderer.invoke('social-leave-visit-room', payload || {}),
  socialGetCurrentRoom: () => ipcRenderer.invoke('social-get-current-room'),
  socialSendVisitInteraction: (payload) => ipcRenderer.invoke('social-send-visit-interaction', payload || {}),
  socialSendVisitChat: (payload) => ipcRenderer.invoke('social-send-visit-chat', payload || {}),
  socialSendVisitRequest: (payload) => ipcRenderer.invoke('social-send-visit-request', payload || {}),
  socialRespondVisitRequest: (payload) => ipcRenderer.invoke('social-respond-visit-request', payload || {}),
  socialGetPendingVisitRequests: () => ipcRenderer.invoke('social-get-pending-visit-requests'),
  socialSendMiniGameRequest: (payload) => ipcRenderer.invoke('social-send-mini-game-request', payload || {}),
  socialRespondMiniGameRequest: (payload) => ipcRenderer.invoke('social-respond-mini-game-request', payload || {}),
  socialStartMiniGame: (payload) => ipcRenderer.invoke('social-start-mini-game', payload || {}),
  socialPlayMiniGameMove: (payload) => ipcRenderer.invoke('social-play-mini-game-move', payload || {}),
  socialResetMiniGame: (payload) => ipcRenderer.invoke('social-reset-mini-game', payload || {}),
  socialGetFeatureFlags: () => ipcRenderer.invoke('social-get-feature-flags'),
  socialUpdateFeatureFlags: (payload) => ipcRenderer.invoke('social-update-feature-flags', payload || {}),
  socialGetRemoteMockInfo: () => ipcRenderer.invoke('social-get-remote-mock-info'),
  onSocialEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('social-event', listener);
    return () => ipcRenderer.removeListener('social-event', listener);
  },
  closeGomokuWindow: () => ipcRenderer.send('close-gomoku-window'),
  openSocialWindow: () => ipcRenderer.send('open-social-window'),
});
