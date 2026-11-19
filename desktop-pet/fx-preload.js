// 全螢幕特效、快捷輪盤、螢幕保護三個視窗共用的連線。主程序那邊的對應在 main.js 的同名段落。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fx', {
  // 全螢幕特效：{ move, dur, dir, scale, species, robe, x, y, ground }（x、y 是角色身體中心在這個視窗裡的位置）
  onPlay: (fn) => ipcRenderer.on('fx-play', (_e, a) => fn(a)),
  // 快捷輪盤：{ items: [{ id, ch, label, on, why }], cx, cy }；選了哪一格回報 id（'more' 是開完整選單）
  onWheel: (fn) => ipcRenderer.on('wheel-open', (_e, a) => fn(a)),
  pick: (id) => ipcRenderer.send('wheel-pick', id),
  // 螢幕保護（桌面上飄東西）：讀角色、游標在不在某個東西上（在才接住滑鼠）、主程序說你回來了、散完了
  info: () => ipcRenderer.invoke('saver-info'),
  clickable: (on) => ipcRenderer.send('saver-clickable', !!on),
  onLeave: (fn) => ipcRenderer.on('saver-leave', () => fn()),
  exit: () => ipcRenderer.send('saver-exit'),
  off: () => ipcRenderer.send('saver-off'),
  play: () => ipcRenderer.send('saver-play'),
  report: (o) => ipcRenderer.send('saver-report', o),   // 告訴主程序：哪顆包子能吃、反派在哪
  onCmd: (fn) => ipcRenderer.on('saver-cmd', (_e, c) => fn(c)),   // 主程序說：吃掉這顆包子、反派被打了一下   // 正在玩（例如拿著龍珠）：先別收起
  onStay: (fn) => ipcRenderer.on('saver-stay', () => fn()),   // 「不要再自動開」：關掉閒置自動開，並收起這一次
});
