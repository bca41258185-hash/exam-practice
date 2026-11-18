const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ui', {
  get: () => ipcRenderer.invoke('ui-get'),            // returns { notes: [{id, text, at}], todos: { date: 'YYYY-MM-DD', items: [{text, done}] } }
  saveNotes: (notes) => ipcRenderer.invoke('ui-notes', notes),   // array of {id, text, at(ms epoch)}; returns saved array
  saveTodos: (todos) => ipcRenderer.invoke('ui-todos', todos),   // {date, items:[{text,done}] (exactly 3 entries, text may be '')}
  toggle: (i) => ipcRenderer.invoke('ui-toggle', i),  // mark item i done/undone; main gives 修為 and celebrates; returns new todos
  close: () => ipcRenderer.send('ui-close'),
  resize: (h) => ipcRenderer.send('ui-resize', h),    // ask window to change height (px) to fit content
  onRefresh: (fn) => ipcRenderer.on('ui-refresh', () => fn()),  // main says data changed: reload via get()
});
