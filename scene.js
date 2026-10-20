// 車窗畫面：窗外模擬風景（會移動）＋透明顯示器上的發光世界（只畫在下緣三分之一）
// 透明 Micro LED 上黑色不發光＝透明，所以發光層全部用「加亮」疊在風景上。
export const GLOW = { amber: '#FFC65C', aqua: '#6FF2E8', petal: '#FF8FB1', white: '#FFF4DC' };

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
function ridge(x, seed, amp, freq) {
  return amp * (0.55 * Math.sin(x * freq + seed) + 0.3 * Math.sin(x * freq * 2.3 + seed * 1.7) + 0.15 * Math.sin(x * freq * 5.1 + seed * 3.1));
}

export function createScene(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const mini = !!opts.mini;
  let W = 0, H = 0, dpr = 1;
  let travel = 0;            // 車子已經走了多遠（像素，給視差用）
  let last = performance.now();
  let introAt = 0, introKey = '';
  let cross = { key: '', start: 0 };
  let arrivedAt = 0;
  let rain = [];
  let burst = [];
  let nightMix = 0;
  let stateRef = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, mini ? 1 : 2);
    const r = canvas.getBoundingClientRect();
    W = Math.max(10, Math.round(r.width)); H = Math.max(10, Math.round(r.height));
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  /* ---------- 窗外風景（模擬） ---------- */
  function drawOutside(s, now) {
    const night = nightMix;
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, mix('#6F86AE', '#05070D', night));
    sky.addColorStop(0.55, mix('#C7A9B9', '#0A0E18', night));
    sky.addColorStop(1, mix('#F3C690', '#141A26', night));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    if (night < 0.98) {
      ctx.globalAlpha = 1 - night;
      const sun = ctx.createRadialGradient(W * 0.72, H * 0.42, 0, W * 0.72, H * 0.42, H * 0.35);
      sun.addColorStop(0, 'rgba(255,214,150,0.9)'); sun.addColorStop(0.15, 'rgba(255,190,120,0.5)'); sun.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
      layer(travel * 0.05, H * 0.47, H * 0.09, 0.004 * (1000 / W), 1.3, '#7C88A6');
      layer(travel * 0.12, H * 0.55, H * 0.07, 0.007 * (1000 / W), 4.2, '#56707A');
      trees(travel * 0.3, H * 0.6);
      river(now, travel);
      bridge(s);
      ctx.globalAlpha = 1;
    }
    tunnel(s, now);
    // 玻璃反光
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(0.4, 'rgba(255,255,255,0)'); g.addColorStop(0.62, 'rgba(255,255,255,0.03)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 透明顯示器會讓窗外稍微暗一點
    ctx.fillStyle = 'rgba(6,10,22,0.18)'; ctx.fillRect(0, 0, W, H);
  }
  function layer(off, base, amp, freq, seed, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, base - Math.abs(ridge(x + off, seed, amp, freq)) - amp * 0.2);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function trees(off, base) {
    const gap = W * 0.07;
    const first = Math.floor(off / gap);
    for (let i = first; i < first + Math.ceil(W / gap) + 2; i++) {
      if (hash(i) < 0.35) continue;
      const x = i * gap - off + hash(i + 9) * gap * 0.5;
      const h = H * (0.05 + hash(i + 3) * 0.06);
      ctx.fillStyle = '#2F4A47';
      ctx.beginPath(); ctx.ellipse(x, base - h, h * 0.42, h * 0.7, 0, 0, TAU); ctx.fill();
      ctx.fillRect(x - 1.5, base - h * 0.4, 3, h * 0.45);
    }
    ctx.fillStyle = '#3B5650'; ctx.fillRect(0, base - 2, W, H * 0.04);
  }
  function river(now, off) {
    const top = H * 0.63;
    const g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, '#6E9BA8'); g.addColorStop(1, '#2C5361');
    ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
    ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 14; k++) {
      const y = top + 8 + k * (H - top) / 14;
      const sp = 0.6 + k * 0.08;
      ctx.beginPath();
      for (let x = -40; x < W + 40; x += 60) {
        const xx = ((x - off * sp) % (W + 80) + W + 80) % (W + 80) - 40;
        ctx.moveTo(xx, y); ctx.lineTo(xx + 18 + 10 * Math.sin(now / 700 + k), y);
      }
      ctx.stroke();
    }
  }
  function bridge(s) {
    const km = s.route.km;
    if (km > 1.35 || km < 0.75) return;
    const p = (1.35 - km) / 0.6;                 // 0→1 從右邊經過到左邊
    const x = W * (1.15 - p * 1.6);
    const y = H * 0.6;
    ctx.strokeStyle = '#3A4A57'; ctx.lineWidth = Math.max(3, W * 0.006);
    ctx.beginPath(); ctx.moveTo(x - W * 0.25, y); ctx.lineTo(x + W * 0.25, y); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, W * 0.22, H * 0.12, 0, Math.PI, TAU); ctx.stroke();
    for (let i = -5; i <= 5; i++) { ctx.beginPath(); ctx.moveTo(x + i * W * 0.04, y); ctx.lineTo(x + i * W * 0.04, y - Math.sqrt(Math.max(0, 1 - Math.pow(i / 5.5, 2))) * H * 0.12); ctx.stroke(); }
  }
  function tunnel(s, now) {
    const km = s.route.km;
    if (!s.route.night && km < 0.16) {
      const p = 1 - km / 0.16;                      // 洞口從右邊進來
      const x = W * (1.05 - p * 1.15);
      ctx.fillStyle = '#4D5560'; ctx.fillRect(x, H * 0.18, W * 1.4, H);
      ctx.fillStyle = '#0B0F18';
      ctx.beginPath(); ctx.ellipse(x + W * 0.5, H * 0.75, W * 0.42, H * 0.5, 0, Math.PI, TAU); ctx.fill();
      ctx.fillRect(x + W * 0.08, H * 0.75, W * 0.84, H);
    }
    if (nightMix > 0.02) {
      ctx.globalAlpha = nightMix;
      ctx.fillStyle = '#070A12'; ctx.fillRect(0, 0, W, H);
      const gap = W * 0.22;
      const off = (travel * 1.4) % gap;
      // 隧道牆：兩條往後退的線，加一排經過的燈
      ctx.strokeStyle = 'rgba(120,130,150,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, H * 0.2); ctx.lineTo(W, H * 0.2); ctx.moveTo(0, H * 0.55); ctx.lineTo(W, H * 0.55); ctx.stroke();
      for (let x = -off; x < W + gap; x += gap) {
        const lamp = ctx.createRadialGradient(x, H * 0.17, 0, x, H * 0.17, H * 0.07);
        lamp.addColorStop(0, 'rgba(255,196,120,0.75)'); lamp.addColorStop(1, 'rgba(255,196,120,0)');
        ctx.fillStyle = lamp; ctx.fillRect(x - H * 0.07, H * 0.1, H * 0.14, H * 0.14);
        ctx.fillStyle = 'rgba(255,214,150,0.95)'; ctx.fillRect(x - W * 0.025, H * 0.165, W * 0.05, 4);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 發光層（透明顯示器） ---------- */
  function glowLine(fn, color, width, blur) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = blur * (1 + nightMix * 0.8);
    ctx.beginPath(); fn(); ctx.stroke(); ctx.restore();
  }
  function glowText(text, x, y, size, color, align = 'left', alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'lighter';
    ctx.font = `700 ${size}px "LXGW WenKai TC", serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.shadowColor = color; ctx.shadowBlur = size * 0.6; ctx.fillStyle = color;
    ctx.fillText(text, x, y); ctx.restore();
  }
  const band = () => ({ top: H * 0.66, bottom: H * 0.97, y: H * 0.84 });
  const bankL = () => W * 0.17, bankR = () => W * 0.83;

  function drawWorld(s, now) {
    if (s.phase === 'idle' && !s.route.running) return;
    const b = band();
    const flow = now / 900;
    // 河（光做的）
    const riverW = s.chosen && s.chosen.effect === 'rain' ? 1 + crossT(now) * 0.6 : 1;
    for (let k = 0; k < 3; k++) {
      glowLine(() => {
        for (let x = W * 0.26; x <= W * 0.74; x += 6) {
          const y = b.y + (k - 1) * H * 0.028 * riverW + Math.sin(x / (W * 0.05) + flow * 3 + k) * H * 0.008;
          x === W * 0.26 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      }, GLOW.aqua, mini ? 1.5 : 2.6, mini ? 6 : 14);
    }
    // 兩岸
    [[W * 0.05, W * 0.25], [W * 0.75, W * 0.95]].forEach(([a, z]) => glowLine(() => {
      ctx.moveTo(a, b.y + H * 0.06); ctx.quadraticCurveTo((a + z) / 2, b.y + H * 0.035, z, b.y + H * 0.06);
    }, GLOW.amber, mini ? 1.5 : 3, mini ? 6 : 14));
    // 對岸的旗子＝目標
    const fx = W * 0.88, fy = b.y + H * 0.045;
    glowLine(() => { ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - H * 0.08); ctx.lineTo(fx + W * 0.03, fy - H * 0.065); ctx.lineTo(fx, fy - H * 0.05); }, GLOW.petal, mini ? 1.2 : 2.4, 10);

    // 規則
    if (s.rule && !mini) glowText('規則：' + s.rule.text, W * 0.04, b.top + H * 0.005, H * 0.034, GLOW.amber);
    else if (s.rule) glowText(s.rule.text, W * 0.04, b.top + H * 0.01, H * 0.05, GLOW.amber);

    drawRouteBar(s, b);
    drawEffects(s, now, b);
    drawCharacter(s, now, b);
    drawBurst(now);
  }

  function drawRouteBar(s, b) {
    const y = H * 0.985, x0 = W * 0.04, x1 = W * 0.96;
    const p = clamp(1 - s.route.km / s.route.total, 0, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,244,220,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    glowLine(() => { ctx.moveTo(x0, y); ctx.lineTo(x0 + (x1 - x0) * p, y); }, GLOW.white, 2.4, 8);
    // 隧道符號
    glowLine(() => { ctx.arc(x1, y + 2, H * 0.016, Math.PI, TAU); }, GLOW.amber, 2, 6);
    if (!mini) {
      const label = s.route.night ? '隧道裡' : `離隧道 ${s.route.km.toFixed(1)} 公里`;
      glowText(label, x1 - W * 0.025, y - H * 0.028, H * 0.024, GLOW.white, 'right', 0.85);
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = GLOW.white; ctx.shadowColor = GLOW.white; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * p, y, mini ? 2.5 : 5, 0, TAU); ctx.fill(); ctx.restore();
  }

  function crossT(now) {
    if (!stateRef || !stateRef.chosen) return 0;
    if (stateRef.phase === 'arrived') return 1;
    return clamp((now - cross.start) / 4000, 0, 1);
  }
  function charPos(s, now, b) {
    const L = { x: bankL(), y: b.y + H * 0.005 }, R = { x: bankR(), y: b.y + H * 0.005 };
    if (!s.chosen) return { x: L.x, y: L.y + Math.sin(now / 500) * H * 0.006, a: 0 };
    const e = s.chosen.effect, raw = crossT(now);
    const t = e === 'rain' ? clamp((raw - 0.35) / 0.65, 0, 1) : ease(raw);
    const x = L.x + (R.x - L.x) * (e === 'rain' ? ease(t) : t);
    let y = L.y;
    if (e === 'fly' || e === 'cloud') y = L.y - Math.sin(t * Math.PI) * H * (e === 'fly' ? 0.2 : 0.12);
    else if (e === 'bubbleBridge') y = L.y - Math.sin(t * Math.PI) * H * 0.1 - Math.abs(Math.sin(t * Math.PI * 5)) * H * 0.03;
    else if (e === 'boat') y = L.y + Math.sin(now / 250) * H * 0.006;
    else y = L.y + Math.sin(t * Math.PI * 4) * H * 0.012;
    return { x, y, a: Math.sin(now / 300) * 0.05 };
  }

  function drawCharacter(s, now, b) {
    if (!s.character || !s.character.strokes || !s.character.strokes.length) return;
    const p = charPos(s, now, b);
    const size = H * (mini ? 0.16 : 0.15) * (1 + nightMix * 0.1);
    ctx.save(); ctx.translate(p.x, p.y - size * 0.45); ctx.rotate(p.a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const st of s.character.strokes) {
      if (!st.p || st.p.length < 2) continue;
      ctx.strokeStyle = st.c || GLOW.aqua; ctx.shadowColor = st.c || GLOW.aqua;
      ctx.shadowBlur = (mini ? 6 : 16) * (1 + nightMix);
      ctx.lineWidth = Math.max(1.5, size * 0.035);
      ctx.beginPath();
      st.p.forEach(([x, y], i) => { const X = (x - 0.5) * size, Y = (y - 0.5) * size; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
    }
    ctx.restore();
    if (s.phase === 'judging' && !mini) {
      for (let i = 0; i < 3; i++) {
        const a = 0.35 + 0.65 * Math.max(0, Math.sin(now / 220 - i * 0.7));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = GLOW.white; ctx.shadowColor = GLOW.white; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(p.x + size * 0.6 + i * H * 0.022, p.y - size * 1.05, H * 0.007, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
  }

  function drawEffects(s, now, b) {
    if (!s.chosen) return;
    const e = s.chosen.effect, t = crossT(now);
    const L = bankL(), R = bankR();
    const p = charPos(s, now, b);
    if (e === 'rain') {
      const n = mini ? 30 : 120;
      while (rain.length < n) rain.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.8 });
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = GLOW.aqua; ctx.shadowColor = GLOW.aqua; ctx.shadowBlur = 6; ctx.lineWidth = mini ? 1 : 1.6;
      ctx.globalAlpha = clamp(t * 3, 0, 1) * (s.phase === 'arrived' ? 0.5 : 1);
      ctx.beginPath();
      rain.forEach(d => { d.y += d.v * 0.012; if (d.y > 1) { d.y = 0; d.x = Math.random(); } const x = d.x * W, y = d.y * H; ctx.moveTo(x, y); ctx.lineTo(x - W * 0.006, y + H * 0.04); });
      ctx.stroke(); ctx.restore();
      const grow = clamp(t / 0.35, 0, 1);
      glowLine(() => { for (let x = L; x <= L + (R - L) * grow; x += 6) { const y = b.y + Math.sin(x / (W * 0.03) + now / 200) * H * 0.008; x === L ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } }, GLOW.aqua, mini ? 2.5 : 5, 20);
    } else if (e === 'boat') {
      const w = H * 0.13;
      glowLine(() => { ctx.moveTo(p.x - w, p.y + H * 0.018); ctx.quadraticCurveTo(p.x, p.y + H * 0.085, p.x + w, p.y + H * 0.018); ctx.closePath(); }, GLOW.amber, mini ? 1.5 : 3, 14);
      glowLine(() => { ctx.moveTo(p.x - w * 0.62, p.y + H * 0.012); ctx.lineTo(p.x - w * 0.62, p.y - H * 0.13); ctx.lineTo(p.x - w * 0.98, p.y + H * 0.004); ctx.closePath(); }, GLOW.white, mini ? 1 : 2, 8);
    } else if (e === 'bubbleBridge') {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        if (u > t * 1.4 + 0.1) continue;
        const x = L + (R - L) * u, y = b.y - Math.sin(u * Math.PI) * H * 0.1 + H * 0.02;
        glowLine(() => ctx.arc(x, y, H * (0.022 + 0.008 * Math.sin(now / 300 + i)), 0, TAU), i % 2 ? GLOW.petal : GLOW.aqua, mini ? 1 : 2, 12);
      }
    } else if (e === 'cloud' || e === 'fly') {
      if (e === 'cloud') glowLine(() => { const r = H * 0.03; ctx.arc(p.x - r, p.y + r * 0.6, r, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(p.x, p.y - r * 0.1, r * 1.3, Math.PI, TAU); ctx.arc(p.x + r * 1.2, p.y + r * 0.6, r, Math.PI * 1.5, Math.PI * 0.5); ctx.closePath(); }, GLOW.white, mini ? 1.2 : 2.5, 14);
      for (let i = 1; i < 14; i++) {
        const q = Math.max(0, t - i * 0.02);
        const x = L + (R - L) * ease(q), y = b.y - Math.sin(q * Math.PI) * H * (e === 'fly' ? 0.2 : 0.12);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - i / 14) * 0.8; ctx.fillStyle = GLOW.amber; ctx.shadowColor = GLOW.amber; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(x, y, H * 0.006, 0, TAU); ctx.fill(); ctx.restore();
      }
    } else {
      for (let i = 0; i < 18; i++) {
        const a = now / 400 + i, r = H * (0.05 + 0.03 * Math.sin(now / 300 + i));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = i % 2 ? GLOW.petal : GLOW.amber; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * r, p.y - H * 0.05 + Math.sin(a) * r, H * 0.005, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
  }

  function spawnBurst() {
    const b = band();
    burst = Array.from({ length: mini ? 30 : 90 }, (_, i) => ({ x: bankR(), y: b.y - H * 0.05, a: Math.random() * TAU, v: (0.15 + Math.random() * 0.35) * H, c: [GLOW.amber, GLOW.aqua, GLOW.petal, GLOW.white][i % 4], born: performance.now() }));
  }
  function drawBurst(now) {
    if (!burst.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    burst = burst.filter(p => now - p.born < 1600);
    burst.forEach(p => {
      const k = (now - p.born) / 1600;
      const d = p.v * ease(Math.min(1, k * 1.3));
      ctx.globalAlpha = 1 - k; ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x + Math.cos(p.a) * d, p.y + Math.sin(p.a) * d * 0.7 + k * k * H * 0.08, (mini ? 1.5 : 3) * (1 - k * 0.5), 0, TAU); ctx.fill();
    });
    ctx.restore();
  }

  function drawIntro(s, now) {
    if (mini || !s.route.running) return;
    const k = (now - introAt) / 3800;
    if (k > 1) return;
    const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
    glowText(s.terrain, W / 2, H * 0.42, H * 0.075, GLOW.white, 'center', a);
    glowText(s.goal, W / 2, H * 0.52, H * 0.036, GLOW.amber, 'center', a * 0.95);
  }
  function drawArrive(s, now) {
    if (mini || s.phase !== 'arrived') return;
    const k = (now - arrivedAt) / 2600;
    if (k > 1) return;
    const a = k < 0.12 ? k / 0.12 : k > 0.7 ? (1 - k) / 0.3 : 1;
    glowText('到對岸了！', W / 2, H * 0.4, H * 0.08, GLOW.petal, 'center', a);
  }
  function drawNightCaption(s, now) {
    if (mini || !s.route.night || !s.character) return;
    const k = (now - nightAt) / 3600;
    if (k > 1) return;
    const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
    glowText(`進隧道了，${s.character.name || '角色'}發光繼續走`, W / 2, H * 0.4, H * 0.05, GLOW.amber, 'center', a);
  }
  let nightAt = 0, wasNight = false;

  function frame(now) {
    const s = stateRef;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (s) {
      if (s.route.running) travel += W * 0.9 * dt * (s.route.fast ? 3 : 1);
      nightMix += ((s.route.night ? 1 : 0) - nightMix) * Math.min(1, dt * 1.6);
      if (s.route.night && !wasNight) nightAt = now;
      wasNight = s.route.night;
      const ik = s.route.running ? 'run' + s.epoch : '';
      if (ik && ik !== introKey) { introKey = ik; introAt = now; }
      const ck = s.chosen ? s.chosen.text + s.chosen.effect + (s.proposal && s.proposal.text) : '';
      if (ck !== cross.key) { cross = { key: ck, start: now }; rain = []; }
      if (s.phase === 'arrived' && !arrivedAt) { arrivedAt = now; spawnBurst(); }
      if (s.phase !== 'arrived') arrivedAt = 0;
      drawOutside(s, now);
      drawWorld(s, now);
      drawIntro(s, now);
      drawArrive(s, now);
      drawNightCaption(s, now);
      if (!mini) {
        ctx.save(); ctx.font = `400 ${H * 0.018}px "LXGW WenKai TC", serif`; ctx.fillStyle = 'rgba(255,244,220,0.45)'; ctx.textAlign = 'right';
        ctx.fillText('窗外為模擬畫面', W * 0.985, H * 0.03); ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { update(s) { stateRef = s; } };
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}
