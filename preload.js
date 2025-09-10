const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Config & Store
    fetchGameConfig: () => ipcRenderer.invoke('fetch-game-config'),
    selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
    getStoreValue: (key) => ipcRenderer.invoke('store:get', key),
    setStoreValue: (key, value) => ipcRenderer.send('store:set', key, value),

    // Game Actions
    checkGameStatus: (gameId) => ipcRenderer.invoke('game:check-status', gameId),
    installGame: (args) => ipcRenderer.send('game:install', args),
    launchGame: (args) => ipcRenderer.send('game:launch', args),

    // Listeners from Main
    onDownloadProgress: (callback) => ipcRenderer.on('game:download-progress', callback),
    onInstallComplete: (callback) => ipcRenderer.on('game:install-complete', callback),
});