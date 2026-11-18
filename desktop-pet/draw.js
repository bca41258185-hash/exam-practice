// 桌寵繪圖：邏輯座標 200x200，地面線 y=188，角色置中。
// o = { state, dir, t(秒), st(進入狀態後秒數), outfit:{hat,robe,gear}, look:{x,y}, bubble:{text,age} }
(function (root) {
  const C = {
    body: '#FFF3D6', line: '#4A3A2A', blush: '#FFB4A8', ear: '#FFC9B8',
    hat: '#E9CB7C', hatD: '#B8923A', robe: '#BFE8DC', robeD: '#5FB7A0', qi: '#59C9A5', gold: '#F5B82E',
    mark: '#E5484D', blade: '#DDEFF5', bolt: '#B48CFF', star: '#8E6BD9',
  };

  // 道袍顏色：[袍子, 衣領與腰帶]
  const ROBES = {
    qing: ['#BFE8DC', '#5FB7A0'], yuebai: ['#EEF2F7', '#9AA9BD'], fei: ['#F6B8B0', '#C9544A'],
    mo: ['#6B7080', '#2E323A'], zixia: ['#D9C8F2', '#8E6BD9'], jin: ['#F7DF9A', '#C99A2E'],
  };
  const TALL_HATS = ['douli', 'guan', 'jin', 'lotus'];
  // 角色：身體顏色、耳朵內側、耳朵與尾巴的形狀、臉上的花紋
  const SPECIES = {
    cat: { body: '#FFF3D6', inner: '#FFC9B8', ears: 'cat', tail: 'cat' },                        // 靈貓
    fox: { body: '#F8B36B', inner: '#FFF1DE', ears: 'fox', tail: 'fox', muzzle: '#FFF1DE' },     // 狐仙
    rabbit: { body: '#FFFFFF', inner: '#FFC4CF', ears: 'rabbit', tail: 'puff' },                 // 玉兔
    panda: { body: '#FFFFFF', inner: '#3B3640', ears: 'round', tail: 'puff', tailColor: '#3B3640', patches: '#5B5560' },  // 熊貓
    dragon: { body: '#B9E6C9', inner: '#F5B82E', ears: 'horn', tail: 'dragon', whisker: true },  // 小青龍
  };

  function drawEars(ctx, sp, t) {
    ctx.lineWidth = 3; ctx.strokeStyle = C.line;
    for (const s of [-1, 1]) {
      ctx.fillStyle = sp.body;
      ctx.beginPath();
      if (sp.ears === 'cat') {
        ctx.moveTo(s * 32 + 2, -46); ctx.lineTo(s * 25 + 2, -72); ctx.lineTo(s * 8 + 2, -58); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = sp.inner; ctx.beginPath();
        ctx.moveTo(s * 27 + 2, -53); ctx.lineTo(s * 24 + 2, -65); ctx.lineTo(s * 15 + 2, -58); ctx.closePath(); ctx.fill();
      } else if (sp.ears === 'fox') {   // 又尖又高
        ctx.moveTo(s * 34 + 2, -44); ctx.lineTo(s * 30 + 2, -82); ctx.lineTo(s * 8 + 2, -58); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = sp.inner; ctx.beginPath();
        ctx.moveTo(s * 28 + 2, -52); ctx.lineTo(s * 28 + 2, -72); ctx.lineTo(s * 15 + 2, -58); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.line; ctx.beginPath();   // 耳尖黑色
        ctx.moveTo(s * 31.5 + 2, -75); ctx.lineTo(s * 30 + 2, -82); ctx.lineTo(s * 25 + 2, -77); ctx.closePath(); ctx.fill();
      } else if (sp.ears === 'rabbit') {   // 長耳朵，輕輕晃
        const sway = Math.sin(t * 2 + s) * 0.06;
        ctx.save(); ctx.translate(s * 14 + 2, -58); ctx.rotate(s * 0.18 + sway);
        ellipse(ctx, 0, -22, 9, 24, sp.body, C.line);
        ellipse(ctx, 0, -22, 4.5, 17, sp.inner, null);
        ctx.restore();
      } else if (sp.ears === 'round') {
        ellipse(ctx, s * 27 + 2, -58, 11, 11, sp.inner, C.line);
      } else if (sp.ears === 'horn') {   // 金色小龍角
        ctx.save(); ctx.translate(s * 16 + 2, -60);
        ctx.fillStyle = sp.inner; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(s * 6 - 1, -20); ctx.lineTo(4, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 2, -9); ctx.lineTo(s * 9, -13); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = sp.body; ctx.lineWidth = 2.6;   // 兩側的小鰭
        ctx.beginPath(); ctx.moveTo(s * 36 + 2, -46); ctx.lineTo(s * 46 + 2, -56); ctx.lineTo(s * 40 + 2, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.lineWidth = 3; ctx.strokeStyle = C.line;
  }

  function drawTail(ctx, sp, wag) {
    ctx.lineWidth = 3; ctx.strokeStyle = C.line;
    if (sp.tail === 'cat') {
      ctx.beginPath(); ctx.moveTo(-36, -20); ctx.quadraticCurveTo(-54, -22, -52, -40 + wag);
      ctx.lineWidth = 7; ctx.stroke();
      ctx.lineWidth = 3.5; ctx.strokeStyle = sp.body; ctx.stroke();
    } else if (sp.tail === 'fox') {   // 蓬鬆大尾巴，尾尖白色
      ctx.save(); ctx.translate(-34, -22); ctx.rotate(-0.6 + wag * 0.03);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-26, 4, -34, -16); ctx.quadraticCurveTo(-30, -32, -16, -30);
      ctx.quadraticCurveTo(-8, -16, 4, -8); ctx.closePath();
      ctx.fillStyle = sp.body; ctx.fill(); ctx.stroke();
      ctx.save(); ctx.clip();
      ellipse(ctx, -27, -26, 12, 10, '#FFF8EE', null);
      ctx.restore();
      ctx.stroke();
      ctx.restore();
    } else if (sp.tail === 'puff') {
      ellipse(ctx, -38, -16, 8, 8, sp.tailColor || sp.body, C.line);
    } else if (sp.tail === 'dragon') {   // 一節一節變細，背上有小刺
      ctx.beginPath(); ctx.moveTo(-34, -14); ctx.quadraticCurveTo(-56, -10, -60, -30 + wag);
      ctx.lineWidth = 11; ctx.stroke();
      ctx.lineWidth = 7; ctx.strokeStyle = sp.body; ctx.stroke();
      ctx.fillStyle = sp.inner; ctx.strokeStyle = C.line; ctx.lineWidth = 2;
      for (const [x, y] of [[-48, -16], [-56, -24 + wag * 0.6]]) {
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 2, y - 8); ctx.lineTo(x + 3, y - 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.lineWidth = 3; ctx.strokeStyle = C.line;
  }   // 戴這些時，頭頂特效要往上移

  function ellipse(ctx, x, y, rx, ry, fill, stroke) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function spark(ctx, x, y, r, a, color) {
    ctx.save();
    ctx.globalAlpha = a; ctx.fillStyle = color; ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const an = i * Math.PI / 4, rr = i % 2 ? r * 0.32 : r;
      ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function star(ctx, x, y, r) {
    ctx.fillStyle = C.star; ctx.strokeStyle = C.line; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function pill(ctx, x, y, s, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    g.addColorStop(0, 'rgba(245,184,46,0.55)'); g.addColorStop(1, 'rgba(245,184,46,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 16 + Math.sin(t * 6) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ellipse(ctx, 0, 0, 7, 7, C.gold, C.line);
    ellipse(ctx, -2, -2.5, 2, 1.5, '#FFF6D0');
    ctx.restore();
  }

  function bolt(ctx, x0, y1, seed) {
    let r = seed * 9301 + 49297;
    const rand = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    ctx.beginPath(); ctx.moveTo(x0, 0);
    let x = x0;
    for (let y = 14; y < y1; y += 14) { x = x0 + (rand() - 0.5) * 26; ctx.lineTo(x, y); }
    ctx.lineTo(x0, y1);
    ctx.strokeStyle = C.bolt; ctx.lineWidth = 6; ctx.globalAlpha = 0.45; ctx.stroke();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.2; ctx.globalAlpha = 1; ctx.stroke();
  }

  function bubble(ctx, text, age) {
    const a = Math.min(1, age * 6, Math.max(0, (3.2 - age) * 3));
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '600 15px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';
    const w = Math.min(188, ctx.measureText(text).width + 22), x = 100 - w / 2, y = 34, h = 30, r = 12;
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.lineTo(106, y + h); ctx.lineTo(100, y + h + 8); ctx.lineTo(94, y + h);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.line; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 100, y + h / 2 + 1, 176);
    ctx.restore();
  }

  function drawHat(ctx, hat, robeD, t) {
    ctx.lineWidth = 3; ctx.strokeStyle = C.line;
    if (hat === 'douli') {   // 斗笠
      ctx.fillStyle = C.hat;
      ctx.beginPath(); ctx.moveTo(-46, -56); ctx.lineTo(3, -90); ctx.lineTo(52, -56);
      ctx.quadraticCurveTo(3, -48, -46, -56); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = C.hatD;
      for (const x of [-26, -10, 16, 32]) { ctx.beginPath(); ctx.moveTo(3, -87); ctx.lineTo(x, -55); ctx.stroke(); }
    } else if (hat === 'guan') {   // 道冠：頭頂小金冠，一支玉簪橫穿
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.moveTo(-8, -60); ctx.lineTo(-11, -80); ctx.lineTo(3, -74); ctx.lineTo(17, -80); ctx.lineTo(14, -60);
      ctx.quadraticCurveTo(3, -56, -8, -60); ctx.closePath(); ctx.fill(); ctx.stroke();
      ellipse(ctx, 3, -66, 3, 3, C.mark, C.line);
      ctx.lineWidth = 3.2; ctx.strokeStyle = C.line;
      ctx.beginPath(); ctx.moveTo(-20, -70); ctx.lineTo(26, -70); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#E8F5EE';
      ctx.beginPath(); ctx.moveTo(-20, -70); ctx.lineTo(26, -70); ctx.stroke();
      ctx.lineWidth = 2;
      ellipse(ctx, -21, -70, 3.4, 3.4, '#7FD1B9', C.line);
      ellipse(ctx, 27, -70, 3.4, 3.4, '#7FD1B9', C.line);
    } else if (hat === 'jin') {   // 書生方巾：軟帽加兩條飄帶
      const flap = Math.sin(t * 3) * 3;
      ctx.lineWidth = 2.4;
      for (const [y, d] of [[-66, 0], [-60, 4]]) {
        ctx.beginPath(); ctx.moveTo(-18, y); ctx.quadraticCurveTo(-34, y + 4 + flap, -44, y + 14 + d + flap);
        ctx.lineWidth = 6; ctx.strokeStyle = C.line; ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = '#3E5A8A'; ctx.stroke();
      }
      ctx.lineWidth = 3; ctx.strokeStyle = C.line; ctx.fillStyle = '#3E5A8A';
      ctx.beginPath(); ctx.moveTo(-20, -58); ctx.lineTo(-17, -80); ctx.lineTo(23, -80); ctx.lineTo(26, -58);
      ctx.quadraticCurveTo(3, -52, -20, -58); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#6F8FC2';
      ctx.beginPath(); ctx.moveTo(3, -79); ctx.lineTo(3, -57); ctx.stroke();
    } else if (hat === 'lotus') {   // 蓮花冠
      for (const [a, r] of [[-0.9, 13], [0.9, 13], [-0.45, 15], [0.45, 15], [0, 17]]) {
        ctx.save(); ctx.translate(3, -60); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-7, -r * 0.6, 0, -r); ctx.quadraticCurveTo(7, -r * 0.6, 0, 0);
        ctx.fillStyle = a === 0 ? '#FFC6D9' : '#FF9EBE'; ctx.lineWidth = 2.2; ctx.strokeStyle = C.line; ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ellipse(ctx, 3, -61, 4, 2.6, C.gold, C.line);
    } else if (hat === 'mask') {   // 狐狸面具：斜戴在頭的一側
      ctx.save(); ctx.translate(-22, -60); ctx.rotate(-0.5);
      ctx.fillStyle = '#FFFFFF'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-9, -15); ctx.lineTo(-3, -8); ctx.lineTo(3, -8); ctx.lineTo(9, -15); ctx.lineTo(10, -4);
      ctx.quadraticCurveTo(8, 8, 0, 11); ctx.quadraticCurveTo(-8, 8, -10, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C.mark; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-7, -1); ctx.lineTo(-3, 1); ctx.moveTo(7, -1); ctx.lineTo(3, 1); ctx.stroke();
      ellipse(ctx, 0, 8, 1.8, 1.4, C.line);
      ctx.fillStyle = C.mark; ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(2, -3, 0, 0); ctx.quadraticCurveTo(-2, -3, 0, -6); ctx.fill();
      ctx.restore();
    } else if (hat === 'wreath') {   // 花環
      ctx.lineWidth = 3; ctx.strokeStyle = '#5E9E5A';
      ctx.beginPath(); ctx.moveTo(-30, -52); ctx.quadraticCurveTo(3, -70, 36, -52); ctx.stroke();
      const flowers = [[-26, -55, '#FFFFFF'], [-12, -61, '#FFD45C'], [3, -63, '#FF9EBE'], [18, -61, '#FFFFFF'], [32, -55, '#FFD45C']];
      for (const [x, y, col] of flowers) {
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5;
          ellipse(ctx, x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, 2.6, 2.6, col, null);
        }
        ellipse(ctx, x, y, 1.8, 1.8, C.gold);
      }
    }
  }

  function drawGearBack(ctx, gear, robeD) {   // 畫在身體後面的配件
    if (gear !== 'sword') return;
    ctx.save(); ctx.translate(-30, -58); ctx.rotate(-0.7);   // 背劍：劍柄從左肩後露出來
    ctx.lineWidth = 2.4; ctx.strokeStyle = C.line;
    ctx.fillStyle = robeD; ctx.beginPath(); ctx.roundRect(-3, -20, 6, 16, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.roundRect(-8, -5, 16, 5, 2); ctx.fill(); ctx.stroke();
    ellipse(ctx, 0, -22, 3, 3, C.gold, C.line);
    ctx.fillStyle = '#7A5A3A'; ctx.beginPath(); ctx.roundRect(-4, 0, 8, 40, 3); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawGearFront(ctx, gear, t) {   // 畫在身體前面的配件
    ctx.lineWidth = 2.4; ctx.strokeStyle = C.line;
    if (gear === 'gourd') {   // 酒葫蘆掛在腰間
      const sw = Math.sin(t * 3) * 0.12;
      ctx.save(); ctx.translate(30, -16); ctx.rotate(sw);
      ctx.strokeStyle = C.mark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 0); ctx.stroke();
      ctx.lineWidth = 2.4; ctx.strokeStyle = C.line;
      ellipse(ctx, 0, 14, 8, 8, '#E9A23B', C.line);
      ellipse(ctx, 0, 3, 5, 5, '#E9A23B', C.line);
      ctx.strokeStyle = C.mark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 7); ctx.lineTo(4, 7); ctx.stroke();
      ellipse(ctx, -2.5, 11, 2, 2.6, 'rgba(255,255,255,0.6)');
      ctx.restore();
    } else if (gear === 'fan') {   // 摺扇拿在身前
      ctx.save(); ctx.translate(-30, -14); ctx.rotate(-0.25 + Math.sin(t * 2) * 0.08);
      ctx.fillStyle = '#FFF8EA'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 20, -Math.PI * 0.85, -Math.PI * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#C9A36A'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const a = -Math.PI * 0.85 + i * Math.PI * 0.7 / 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.stroke();
      }
      ctx.strokeStyle = '#4A7A5A'; ctx.lineWidth = 1.6;   // 扇面上一筆山水
      ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(-4, -14); ctx.lineTo(1, -10); ctx.lineTo(6, -15); ctx.lineTo(11, -9); ctx.stroke();
      ctx.restore();
    }
  }

  function drawPet(ctx, o) {
    const fit = o.outfit || {};
    const hat = fit.hat || (o.helmet ? 'douli' : 'none');
    const [robe, robeD] = ROBES[fit.robe] || ROBES.qing;
    const gear = fit.gear || 'none';
    const sp = SPECIES[fit.species] || SPECIES.cat;
    const state = o.state, t = o.t, st = o.st, dir = o.dir < 0 ? -1 : 1;
    const look = o.look || { x: 0, y: 0 };
    const moving = state === 'walk' || state === 'chase' || state === 'climb';
    const air = state === 'drag' || state === 'fall';
    const fly = state === 'roll';            // 御劍飛行
    const med = state === 'sleep';           // 打坐修煉
    const trib = state === 'tribulation';    // 渡劫
    const zap = trib && st < 2.3 && (st * 8 % 2) < 1.1;
    const flip = state === 'leap';                          // 輕功：空中翻筋斗
    const float = state === 'hover' || state === 'land';    // 踏空、飄落
    const taichi = state === 'taichi';                      // 打太極
    const climb = state === 'climb', hang = state === 'hang';   // 壁虎遊牆功、倒掛
    const drink = state === 'drink', gaze = state === 'gaze';   // 喝水、看遠方
    let lift = 0, sx = 1, sy = 1, rot = 0;

    if (state === 'idle' || state === 'peek' || state === 'eat') sy = 1 + 0.02 * Math.sin(t * 2.4);
    if (moving) lift = Math.abs(Math.sin(t * (state === 'chase' ? 14 : 9))) * 4;
    if (med) { lift = 12 + Math.sin(t * 1.6) * 3; sy = 0.94; sx = 1.04; }
    if (fly) lift = 30 + Math.sin(t * 7) * 2;
    if (trib) { rot = zap ? Math.sin(t * 60) * 0.05 : 0; sy = zap ? 0.95 : 1; }
    if (air) { sx = 0.93; sy = 1.09; rot = Math.sin(t * 9) * (state === 'drag' ? 0.09 : 0.04); }
    if (state === 'happy') lift = Math.abs(Math.sin(st * 9)) * 16 * Math.max(0, 1 - st / 1.4);
    if (state === 'startle') lift = Math.max(0, Math.sin(Math.min(st, 0.5) * Math.PI * 2)) * 14;
    if (state === 'dizzy') rot = Math.sin(t * 6) * 0.16;
    if (state === 'peek') rot = -0.13;
    if (flip) { const p = Math.min(1, st / 0.43); rot = p * Math.PI * 2; sx = 0.94; sy = 1.04; }
    if (float) { lift = 6 + Math.sin(t * 6) * 2; }
    if (drink) rot = -0.18 - Math.max(0, Math.sin(st * 2.2)) * 0.12;   // 仰頭喝
    if (gaze) { rot = -0.08; lift = 2 + Math.sin(t * 1.5) * 1.5; }
    if (climb) rot = -Math.PI / 2;                   // 腳貼著牆（左右牆都一樣，因為已經先左右翻轉）
    if (hang) rot = Math.PI + Math.sin(t * 3) * 0.08;   // 倒掛，輕輕晃
    if (state === 'spin') rot = st * Math.PI * 4;   // 被劍氣吹得原地轉圈
    if (taichi) { rot = Math.sin(t * 1.4) * 0.16; sy = 1 + Math.sin(t * 2.8) * 0.03; lift = 2 + Math.max(0, Math.sin(t * 1.4)) * 3; }

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // 影子
    if (!air && !flip && !float && !climb && !hang) ellipse(ctx, 100, 188, Math.max(14, 34 - lift * 0.6), 4, 'rgba(0,0,0,0.13)');
    if (taichi) {
      ctx.save(); ctx.translate(100, 186 - lift - 94 + Math.sin(t * 2) * 3); ctx.rotate(t * 1.6); ctx.globalAlpha = 0.95;
      const R = 15;
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2E3A3A'; ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2);
      ctx.arc(0, R / 2, R / 2, Math.PI / 2, Math.PI * 1.5); ctx.arc(0, -R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, R / 2, R / 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2E3A3A'; ctx.beginPath(); ctx.arc(0, -R / 2, R / 7, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = C.line; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (float) {   // 腳下一朵小雲，踏著借力
      ctx.save(); ctx.globalAlpha = 0.9; ctx.lineWidth = 2;
      ellipse(ctx, 86, 186, 14, 6, '#F3F7F2', C.qi); ellipse(ctx, 114, 186, 14, 6, '#F3F7F2', C.qi); ellipse(ctx, 100, 183, 16, 8, '#F3F7F2', C.qi);
      ctx.restore();
    }
    if (med) {
      for (let i = 0; i < 2; i++) {
        const p = (t * 0.4 + i / 2) % 1;
        ctx.globalAlpha = (1 - p) * 0.7; ctx.lineWidth = 2;
        ellipse(ctx, 100, 186, 20 + p * 44, 3 + p * 6, null, C.qi);
      }
      ctx.globalAlpha = 1;
    }

    ctx.translate(100, 186 - lift);
    ctx.scale(dir, 1);
    ctx.scale(sx, sy);
    ctx.translate(0, -32); ctx.rotate(rot); ctx.translate(0, 32);
    ctx.lineWidth = 3; ctx.strokeStyle = C.line;

    // 尾巴
    if (fly) {
      // 飛劍與劍光
      ctx.lineWidth = 2; ctx.strokeStyle = C.qi;
      for (let i = 0; i < 3; i++) {
        const p = (t * 3 + i / 3) % 1;
        ctx.globalAlpha = 1 - p;
        ctx.beginPath(); ctx.moveTo(-50 - p * 34, 2 + i * 5); ctx.lineTo(-70 - p * 34, 2 + i * 5); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 2.4; ctx.strokeStyle = C.line; ctx.fillStyle = C.blade;
      ctx.beginPath(); ctx.moveTo(-34, 4); ctx.lineTo(48, 4); ctx.lineTo(62, 8); ctx.lineTo(48, 12); ctx.lineTo(-34, 12); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.gold; ctx.beginPath(); ctx.roundRect(-40, 0, 7, 16, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = robeD; ctx.beginPath(); ctx.roundRect(-56, 5, 16, 6, 2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 3;
    }
    drawGearBack(ctx, gear, robeD);
    ctx.lineWidth = 3; ctx.strokeStyle = C.line;
    const wag = Math.sin(t * (state === 'happy' ? 16 : 4)) * (med ? 1 : 6);
    drawTail(ctx, sp, wag);

    // 腳
    const ph = moving ? Math.sin(t * (state === 'chase' ? 14 : 9)) : 0;
    const dangle = air ? 5 + Math.sin(t * 12) * 2 : flip ? -4 : 0;
    if (!med) {
      const foot = sp.patches || sp.body;   // 熊貓的腳是黑的
      ellipse(ctx, -15 + ph * 7, -1 + dangle - Math.max(0, ph) * 3, 9, 5, foot, C.line);
      ellipse(ctx, 15 - ph * 7, -1 + dangle - Math.max(0, -ph) * 3, 9, 5, foot, C.line);
    }

    // 耳朵
    drawEars(ctx, sp, t);

    // 身體
    ellipse(ctx, 0, -32, 40, 32, zap ? '#FFFFFF' : sp.body, null);
    if (sp.muzzle && !zap) {   // 狐狸白色的臉頰與下巴
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, -32, 40, 32, 0, 0, Math.PI * 2); ctx.clip();
      ellipse(ctx, 6, -24, 26, 14, sp.muzzle, null);
      ctx.restore();
    }
    if (sp.patches && !zap) {   // 熊貓眼圈
      ctx.save(); ctx.fillStyle = sp.patches;
      for (const [x, a] of [[-8, 0.5], [20, -0.5]]) { ctx.beginPath(); ctx.ellipse(x, -36, 8, 10, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // 道袍：交領與腰帶
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, -32, 40, 32, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = robe;
    ctx.beginPath(); ctx.moveTo(-44, -20); ctx.lineTo(8, -6); ctx.lineTo(44, -20); ctx.lineTo(44, 4); ctx.lineTo(-44, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = robeD; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-44, -20); ctx.lineTo(8, -6); ctx.lineTo(44, -20); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = C.line;
    ellipse(ctx, 0, -32, 40, 32, null, C.line);
    // 眉心印記
    ctx.fillStyle = C.mark;
    ctx.beginPath(); ctx.moveTo(6, -55); ctx.quadraticCurveTo(9.5, -50, 6, -46); ctx.quadraticCurveTo(2.5, -50, 6, -55); ctx.fill();

    // 臉
    let lx = Math.max(-3, Math.min(3, look.x * dir / 60)), ly = Math.max(-2.5, Math.min(2.5, look.y / 60));
    if (gaze) { lx = 3; ly = -2.5; }
    const ex1 = -8, ex2 = 20, ey = -37;
    const blink = (t % 4.2) < 0.14;
    ctx.fillStyle = C.line; ctx.lineWidth = 2.6;
    const eye = (x) => {
      if (med || taichi || drink || (blink && (state === 'idle' || moving || state === 'peek' || fly))) {
        ctx.beginPath(); ctx.moveTo(x - 5, ey); ctx.quadraticCurveTo(x, ey + (med ? 4 : 0), x + 5, ey); ctx.stroke();
      } else if (flip) {
        ctx.beginPath(); ctx.moveTo(x - 5, ey - 3); ctx.lineTo(x + 1, ey); ctx.lineTo(x - 5, ey + 3); ctx.stroke();
      } else if (state === 'happy' || state === 'eat') {
        ctx.beginPath(); ctx.moveTo(x - 5, ey + 2); ctx.lineTo(x, ey - 3); ctx.lineTo(x + 5, ey + 2); ctx.stroke();
      } else if (state === 'dizzy') {
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.4) {
          const r = a * 0.5, px = x + Math.cos(a + t * 8) * r, py = ey + Math.sin(a + t * 8) * r;
          a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.lineWidth = 1.8; ctx.stroke(); ctx.lineWidth = 2.6;
      } else if (air || state === 'startle' || (trib && st < 2.3)) {
        ellipse(ctx, x, ey, 5.5, 6.5, '#FFFFFF', C.line);
        ellipse(ctx, x, ey, 2.2, 2.2, C.line);
      } else if (sp.patches) {
        ellipse(ctx, x + lx, ey + ly, 3.6, 4.2, '#FFFFFF');
        ellipse(ctx, x + lx, ey + ly, 2.2, 2.6, C.line);
      } else {
        ellipse(ctx, x + lx, ey + ly, 4.6, 5.2, C.line);
        ellipse(ctx, x + lx + 1.4, ey + ly - 1.8, 1.5, 1.5, '#FFFFFF');
      }
    };
    eye(ex1); eye(ex2);
    ellipse(ctx, -19, -25, 6.5, 4, C.blush);
    ellipse(ctx, 31, -25, 6.5, 4, C.blush);
    if (sp.whisker) {   // 龍鬚
      ctx.save(); ctx.strokeStyle = C.line; ctx.lineWidth = 1.8;
      const w = Math.sin(t * 3) * 2;
      ctx.beginPath(); ctx.moveTo(-26, -30); ctx.quadraticCurveTo(-38, -30, -44, -40 + w); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(38, -30); ctx.quadraticCurveTo(50, -30, 54, -40 - w); ctx.stroke();
      ctx.restore();
    }

    // 嘴
    ctx.lineWidth = 2.2; ctx.strokeStyle = C.line;
    const chew = state === 'eat' ? Math.abs(Math.sin(st * 10)) : 0;
    if (state === 'eat' || air || state === 'startle') {
      ellipse(ctx, 6, -26, 4, state === 'eat' ? 1.5 + chew * 4 : 4.5, '#C8553D', C.line);
    } else if (med) {
      ctx.beginPath(); ctx.moveTo(2, -28); ctx.lineTo(10, -28); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(0, -29); ctx.quadraticCurveTo(3, -25, 6, -29); ctx.quadraticCurveTo(9, -25, 12, -29); ctx.stroke();
    }

    if (drink) {
      ctx.save(); ctx.translate(18, -25); ctx.rotate(-1.9 + Math.sin(st * 2.2) * 0.12);   // 壺口對著嘴
      ctx.lineWidth = 2.4; ctx.strokeStyle = C.line;
      ellipse(ctx, 0, 12, 8, 8, '#E9A23B', C.line);
      ellipse(ctx, 0, 1, 5, 5, '#E9A23B', C.line);
      ctx.strokeStyle = C.mark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 5); ctx.lineTo(4, 5); ctx.stroke();
      ctx.restore();
    }
    // 叼著傳音符（黃符紅字）
    if (fit.carry) {
      ctx.save(); ctx.translate(8, -18); ctx.rotate(0.25 + Math.sin(t * 8) * 0.06);
      ctx.fillStyle = '#F7D154'; ctx.strokeStyle = C.line; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(-6, -6, 12, 26); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C.mark; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(2, 2); ctx.lineTo(-2, 6); ctx.lineTo(2, 10); ctx.lineTo(-2, 14); ctx.stroke();
      ctx.restore();
    }
    // 飯糰
    if (state === 'eat') pill(ctx, 36, -20 - chew * 2, Math.max(0.3, 1 - st / 3.2), t);

    // 配件與頭飾
    drawGearFront(ctx, gear, t);
    drawHat(ctx, hat, robeD, t);
    ctx.restore();

    // 特效（不翻轉）
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const top = 186 - lift - (TALL_HATS.includes(hat) || sp.ears === 'rabbit' ? 92 : 76) * sy;
    if (gaze) {
      const ox = dir > 0 ? 1 : -1;
      ctx.save(); ctx.globalAlpha = 0.75; ctx.strokeStyle = C.qi; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.moveTo(100 + ox * 20, 130 - lift); ctx.lineTo(100 + ox * 78, 54); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = 'rgba(89,201,165,0.35)'; ctx.strokeStyle = C.qi;
      ctx.beginPath(); ctx.moveTo(100 + ox * 58, 60); ctx.lineTo(100 + ox * 72, 40); ctx.lineTo(100 + ox * 80, 50); ctx.lineTo(100 + ox * 88, 36); ctx.lineTo(100 + ox * 98, 60); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (state === 'fireworks') {   // 三件事都完成：放煙火
      const cols = [C.gold, C.mark, C.qi, '#8E6BD9'];
      for (let b = 0; b < 3; b++) {
        const p = ((st + b * 0.45) % 1.35) / 1.35, bx = 50 + b * 50, by = 60 - b % 2 * 18;
        for (let i = 0; i < 10; i++) {
          const a = i * Math.PI / 5 + b;
          spark(ctx, bx + Math.cos(a) * p * 34, by + Math.sin(a) * p * 34 + p * p * 10, 4.5, 1 - p, cols[(i + b) % 4]);
        }
      }
    }
    if (taichi) {
      for (let i = 0; i < 2; i++) {
        const a = t * 1.4 + i * Math.PI;
        spark(ctx, 100 + Math.cos(a) * 58, 132 + Math.sin(a) * 50, 5, 0.9, i ? C.gold : C.qi);
      }
    }
    if (flip) {
      ctx.lineWidth = 3; ctx.strokeStyle = C.qi;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.6 - i * 0.18;
        ctx.beginPath(); ctx.arc(100, 154 - lift, 44 + i * 7, Math.PI * (dir > 0 ? 0.6 : -0.4) , Math.PI * (dir > 0 ? 1.4 : 0.4)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (state === 'happy') {
      for (let i = 0; i < 4; i++) {
        const p = (st * 0.8 + i * 0.25) % 1;
        spark(ctx, 100 + (i - 1.5) * 22 + Math.sin(p * 6 + i) * 4, top + 6 - p * 36, 5 + (i % 2) * 2.5, 1 - p, i % 2 ? C.gold : C.qi);
      }
    }
    if (med) {
      for (let i = 0; i < 6; i++) {
        const p = (t * 0.3 + i / 6) % 1, a = i * 2.4;
        spark(ctx, 100 + Math.cos(a) * (46 - p * 22), 176 - p * 96, 3.5, Math.sin(p * Math.PI), C.qi);
      }
    }
    if (trib) {
      if (zap) bolt(ctx, 100 + Math.sin(Math.floor(st * 8)) * 10, top + 8, Math.floor(st * 8) + 1);
      if (st >= 2.3) {
        for (let i = 0; i < 8; i++) {
          const p = Math.min(1, (st - 2.3) / 0.9), a = i * Math.PI / 4;
          spark(ctx, 100 + Math.cos(a) * p * 62, 150 + Math.sin(a) * p * 50, 7, 1 - p, C.gold);
        }
      }
    }
    if (state === 'dizzy') {
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + i * Math.PI * 2 / 3;
        star(ctx, 100 + Math.cos(a) * 30, top + 4 + Math.sin(a) * 7, 6);
      }
    }
    if (state === 'startle') {
      ctx.fillStyle = '#E5484D'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', 100 + dir * 44, top + 18);
    }
    if (o.bubble) bubble(ctx, o.bubble.text, o.bubble.age);
    ctx.restore();
  }

  root.drawPet = drawPet;
  root.PET_ROBES = Object.keys(ROBES);
})(typeof window !== 'undefined' ? window : globalThis);
