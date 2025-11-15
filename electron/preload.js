const { contextBridge } = require('electron');

// Expose an empty API surface that can be expanded later.
contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong'
});
