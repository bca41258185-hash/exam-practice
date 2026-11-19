// 全螢幕特效、快捷輪盤、螢幕保護三個視窗共用的連線。主程序那邊的對應在 main.js 的同名段落。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fx', {
  // 全螢幕特效：{ move, dur, dir, scale, species, robe, x, y, ground }（x、y 是角色身體中心在這個視窗裡的位置）
  onPlay: (fn) => ipcRenderer.on('fx-play', (_e, a) => fn(a)),
  // 快捷輪盤：{ items: [{ id, ch, label, on, why }], cx, cy }；選了哪一格回報 id（'more' 是開完整選單）
  onWheel: (fn) => ipcRenderer.on('wheel-open', (_e, a) => fn(a)),
  pick: (id) => ipcRenderer.send('wheel-pick', id),
  // 螢幕保護：讀角色與今天的資料、摸牠（回傳有沒有加到修為）、結束
  info: () => ipcRenderer.invoke('saver-info'),
  touch: () => ipcRenderer.invoke('saver-touch'),
  exit: () => ipcRenderer.send('saver-exit'),
});
