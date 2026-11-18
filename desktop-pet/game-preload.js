// 小遊戲與天象視窗（三仙歸洞、比劍、祥瑞、許願）共用的連線。主程序那邊的對應在 main.js 的「小遊戲視窗」。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('game', {
  // 靈寵現在的樣子與境界：{ species, hat, robe, gear, realm, realmName, scale }（可直接當 drawPet 的 outfit）
  info: () => ipcRenderer.invoke('game-info'),
  // 回報結果，例如 { game: 'cups', win: true }、{ game: 'duel', win: false, combo: 12 }、
  // { game: 'omen', kind: 'meteor', clicked: true }、{ game: 'wish', text: '考上建築師' }
  result: (obj) => ipcRenderer.send('game-result', obj),
  close: () => ipcRenderer.send('game-close'),
  // 天象視窗：主程序告訴你要演哪一種 { kind: 'koi' | 'crane' | 'rainbow' | 'meteor' }
  onStart: (fn) => ipcRenderer.on('game-start', (_e, arg) => fn(arg)),
  // 透明視窗要不要接住滑鼠（滑鼠在可點的東西上時 true，其他地方 false 讓點擊穿透）
  setClickable: (on) => ipcRenderer.send('game-clickable', !!on),
  // 許願視窗：讀出以前許過的願 [{ text, at }]
  wishes: () => ipcRenderer.invoke('game-wishes'),
});
