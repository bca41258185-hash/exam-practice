const { contextBridge, ipcRenderer } = require('electron');

const OUT = ['hit', 'drag-start', 'drag-end', 'click', 'menu', 'roll', 'frame'];

contextBridge.exposeInMainWorld('pet', {
  send: (ch, arg) => { if (OUT.includes(ch)) ipcRenderer.send(ch, arg); },
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
  onCursor: (fn) => ipcRenderer.on('cursor', (_e, c) => fn(c)),
  onCursorAt: (fn) => ipcRenderer.on('cursor-at', (_e, c) => fn(c)),
  onSay: (fn) => ipcRenderer.on('say', (_e, t) => fn(t)),
});
