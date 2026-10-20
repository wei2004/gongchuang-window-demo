import { OfflineGame } from './offline-engine.js';
import { createScene, GLOW } from './scene.js';

const QS = new URLSearchParams(location.search);
const SCREEN = 'stage';
const IMPROV = QS.get('improv') === '1';
const app = document.getElementById('app');
let S = null;
const views = [];
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(k => k != null && el.append(k.nodeType ? k : document.createTextNode(k)));
  return el;
};

/* Browser-local state: never connects to a server. */
const game = new OfflineGame();
const send = (action, data = {}) => game.act(action, data);
function connect() {
  game.subscribe(state => { S = state; views.forEach(view => view.update(state)); });
  setInterval(() => game.tick(), 250);
}
let lastSay = 0, soundOn = false;
function speak(s) {
  if (!soundOn || !s.say || s.say.id === lastSay || !('speechSynthesis' in window)) return;
  lastSay = s.say.id;
  const voice = speechSynthesis.getVoices().find(v => v.localService && /^zh/i.test(v.lang));
  if (!voice) return;
  const utterance = new SpeechSynthesisUtterance(s.say.text);
  utterance.voice = voice; utterance.lang = voice.lang;
  speechSynthesis.cancel(); speechSynthesis.speak(utterance);
}

/* ---------------- 圖示（發光線條） ---------------- */
const ICON = {
  rain: '<path d="M14 26a10 10 0 0 1 19-5 8 8 0 1 1 3 15H16a8 8 0 0 1-2-10z"/><path d="M18 42l-3 7M27 42l-3 7M36 42l-3 7"/>',
  boat: '<path d="M8 34h40l-6 10H14z"/><path d="M28 34V10l14 20H28"/>',
  bubbleBridge: '<circle cx="12" cy="36" r="6"/><circle cx="26" cy="26" r="7"/><circle cx="41" cy="34" r="6"/>',
  cloud: '<path d="M14 36a10 10 0 0 1 4-19 12 12 0 0 1 22 4 8 8 0 0 1 0 15z"/>',
  fly: '<path d="M6 40c12-22 30-28 44-26"/><path d="M42 8l8 6-9 4"/>',
  other: '<path d="M28 6l5 14 14 2-11 9 4 15-12-8-12 8 4-15-11-9 14-2z"/>',
};
const iconFor = (effect, color) => `<svg viewBox="0 0 56 56" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px ${color})">${ICON[effect] || ICON.other}</svg>`;
const EFFECT_COLOR = { rain: GLOW.aqua, boat: GLOW.amber, bubbleBridge: GLOW.petal, cloud: GLOW.white, fly: GLOW.amber, other: GLOW.petal };

/* ---------------- 後座平板：造物、接力 ---------------- */
function RearPanel(host) {
  const root = h('div', { class: 'pad' });
  host.append(root);
  let key = '';
  let strokes = [], color = GLOW.aqua, drawCanvas = null;


  function drawStrokes() {
    if (!drawCanvas) return;
    const c = drawCanvas, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokes.forEach(st => {
      ctx.strokeStyle = st.c; ctx.shadowColor = st.c; ctx.shadowBlur = 10; ctx.lineWidth = c.width * 0.012;
      ctx.beginPath(); st.p.forEach(([x, y], i) => (i ? ctx.lineTo(x * c.width, y * c.height) : ctx.moveTo(x * c.width, y * c.height))); ctx.stroke();
    });
  }
  function normalized() {
    // 把筆畫裁到剛好、等比放進 0..1 的方框（給車窗畫角色用）
    const c = drawCanvas, ar = c.width / c.height;
    const pts = strokes.flatMap(s => s.p.map(([x, y]) => [x * ar, y]));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const side = Math.max(x1 - x0, y1 - y0) || 1;
    const ox = (side - (x1 - x0)) / 2, oy = (side - (y1 - y0)) / 2;
    return strokes.map(s => ({ c: s.c, p: s.p.filter((_, i) => i % 2 === 0 || i === s.p.length - 1).map(([x, y]) => [+(((x * ar - x0 + ox) / side)).toFixed(3), +(((y - y0 + oy) / side)).toFixed(3)]) }));
  }
  function snapshot() {
    const n = normalized(), size = 512, c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 10;
    n.forEach(s => { ctx.strokeStyle = '#222'; ctx.beginPath(); s.p.forEach(([x, y], i) => { const X = 40 + x * (size - 80), Y = 40 + y * (size - 80); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); });
    return { strokes: n, image: c.toDataURL('image/png') };
  }
  function bindDraw(wrap) {
    const c = wrap.querySelector('canvas');
    drawCanvas = c;
    const fit = () => { const r = c.getBoundingClientRect(); c.width = Math.max(10, r.width * 1.5); c.height = Math.max(10, r.height * 1.5); drawStrokes(); };
    new ResizeObserver(fit).observe(c);
    let cur = null;
    const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); cur = { c: color, p: [pt(e)] }; strokes.push(cur); wrap.querySelector('.hint').hidden = true; drawStrokes(); });
    c.addEventListener('pointermove', e => { if (!cur) return; cur.p.push(pt(e)); drawStrokes(); });
    const end = () => { cur = null; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  }

  function build(s) {
    root.replaceChildren();
    const name = s.character && (s.character.name || s.character.guess);
    const notice = h('div', { class: 'notice' }, s.notice || '');
    switch (s.phase) {
      case 'idle':
        root.append(h('div', { class: 'say' }, '等車子出發'), h('div', { class: 'sub' }, '出發後，在這裡畫一個角色'));
        break;
      case 'create': {
        strokes = [];
        const chips = [GLOW.aqua, GLOW.amber, GLOW.petal].map(c => h('button', { class: 'chip', style: `background:${c}`, 'aria-label': '換顏色', 'aria-pressed': String(c === color), onclick: e => { color = c; chips.forEach(x => x.setAttribute('aria-pressed', String(x === e.currentTarget))); } }));
        const wrap = h('div', { class: 'draw' }, h('canvas'), h('div', { class: 'hint' }, '用手指畫一個角色'));
        root.append(h('div', { class: 'say' }, '畫一個角色'), notice, wrap,
          h('div', { class: 'row' }, ...chips, h('button', { class: 'btn', onclick: () => { strokes = []; wrap.querySelector('.hint').hidden = false; drawStrokes(); } }, '擦掉'),
            h('button', { class: 'btn go', style: 'margin-left:auto', onclick: () => { if (strokes.length) send('drawDone', snapshot()); } }, '畫好了')));
        bindDraw(wrap);
        break;
      }
      case 'guessing':
        root.append(h('div', { class: 'say' }, '正在準備角色'), h('div', { class: 'think' }, h('i'), h('i'), h('i')));
        break;
      case 'confirm': {
        const field = h('input', { class: 'field', placeholder: '它是…', 'aria-label': '角色名字' });
        root.append(h('div', { class: 'say' }, `角色叫做${s.character.guess}？`),
          h('div', { class: 'sub' }, s.character.traits.length ? '能力：' + s.character.traits.join('、') : ''), notice,
          h('div', { class: 'row' }, h('button', { class: 'btn go', onclick: () => send('confirmGuess', {}) }, '就叫這個！')),
          h('div', { class: 'row' }, field, h('button', { class: 'btn', onclick: () => field.value.trim() && send('confirmGuess', { name: field.value.trim() }) }, '用這個名字')));
        break;
      }
      case 'rule':
        root.append(h('div', { class: 'say' }, `${name}加入了！`), h('div', { class: 'sub' }, '等副駕立一條規則'));
        break;
      case 'relay': {
        const field = h('input', { class: 'field', placeholder: '例如：坐船過河、坐熱氣球', 'aria-label': '過河辦法', onkeydown: e => { if (e.key === 'Enter' && field.value.trim()) send('propose', { text: field.value.trim() }); } });
        const mic = h('div', { class: 'sub' }, '輸入過河辦法；離線版使用預設關鍵字判斷。');
        root.append(h('div', { class: 'say' }, `你想用什麼方法讓${name}過河？`), h('div', { class: 'sub' }, `規則：${s.rule.text}`), notice,
          h('div', { class: 'row', style: 'flex:1;justify-content:center' }, mic),
          h('div', { class: 'row' }, field, h('button', { class: 'btn go', onclick: () => field.value.trim() && send('propose', { text: field.value.trim() }) }, '送出')));
        break;
      }
      case 'judging':
        root.append(h('div', { class: 'said' }, `「${s.proposal.text}」`), h('div', { class: 'say' }, '正在套用示範規則'), h('div', { class: 'think' }, h('i'), h('i'), h('i')));
        break;
      case 'choose': {
        const p = s.proposal;
        root.append(h('div', { class: 'said' }, `「${p.text}」`));
        if (p.pass) {
          root.append(h('div', { class: 'say' }, `可以！${p.reason}`), h('div', { class: 'row' }, h('button', { class: 'btn go', onclick: () => send('choose', { index: -1 }) }, '出發')));
        } else {
          root.append(h('div', { class: 'say' }, p.source === 'fallback' ? '網路慢，先用這三招' : '可以，但要先…你選一個'));
          const box = h('div', { class: 'options' });
          p.options.forEach((o, i) => {
            const b = h('button', { class: 'option', onclick: () => { b.classList.add('picked'); send('choose', { index: i }); } });
            b.innerHTML = iconFor(o.effect, EFFECT_COLOR[o.effect] || GLOW.amber);
            b.append(h('span', {}, o.text));
            box.append(b);
          });
          root.append(box);
        }
        break;
      }
      case 'crossing':
        root.append(h('div', { class: 'say' }, `${name}出發了！`), h('div', { class: 'sub' }, s.chosen.text));
        break;
      case 'arrived':
        root.append(h('div', { class: 'say' }, '到對岸了！'), h('div', { class: 'sub' }, s.chosen.text),
          h('div', { class: 'row' }, h('button', { class: 'btn aqua', onclick: () => send('again') }, '再想一個過河辦法')));
        break;
    }
  }
  return {
    update(s) {
      const k = [s.phase, s.epoch, s.character && s.character.guess, s.proposal && s.proposal.text, s.proposal && s.proposal.options && s.proposal.options.length, s.notice].join('|');
      if (k !== key) { key = k; build(s); }
    },
  };
}

/* ---------------- 副駕：立規則 ---------------- */
function FrontPanel(host, withThumb = true) {
  const root = h('div', { class: 'pad', style: 'flex-direction:row;gap:3cqmin' });
  const left = h('div', { style: 'flex:1;display:flex;flex-direction:column;gap:2.2cqmin' });
  root.append(left);
  let scene = null;
  if (withThumb) {
    const thumb = h('div', { class: 'thumb' }, h('canvas', { class: 'scene' }));
    root.append(h('div', { style: 'display:flex;flex-direction:column;gap:1cqmin' }, h('div', { class: 'sub' }, '後座車窗（前座看不到，這裡同步）'), thumb));
    scene = createScene(thumb.querySelector('canvas'), { mini: true });
  }
  host.append(root);
  let key = '';
  function build(s) {
    left.replaceChildren();
    const name = s.character && (s.character.name || s.character.guess);
    const canSet = ['rule', 'relay', 'arrived', 'choose'].includes(s.phase);
    if (!canSet && !s.rule) {
      left.append(h('div', { class: 'say' }, '等後座畫好角色'), h('div', { class: 'sub' }, '角色加入後，在這裡立一條規則'));
      return;
    }
    const field = h('input', { class: 'field', placeholder: '自己訂一條規則', 'aria-label': '自訂規則', onkeydown: e => { if (e.key === 'Enter' && field.value.trim()) send('setRule', { text: field.value.trim() }); } });
    left.append(
      h('div', { class: 'say' }, s.rule ? `規則：${s.rule.text}` : `幫${name}立一條規則`),
      h('div', { class: 'notice' }, s.notice || ''),
      h('div', { class: 'rules' }, ...s.rules.map(r => h('button', { class: 'rule', 'aria-pressed': String(!!s.rule && s.rule.text === r), disabled: !canSet, onclick: () => send('setRule', { text: r }) }, r))),
      h('div', { class: 'sub' }, '離線版提供三種預設規則'));
  }
  return {
    update(s) {
      if (scene) scene.update(s);
      const k = [s.phase, s.epoch, s.rule && s.rule.text, s.character && s.character.name, s.notice].join('|');
      if (k !== key) { key = k; build(s); }
    },
  };
}

/* ---------------- 操作台 ---------------- */
function ConsolePanel(host) {
  const root = h('div', { class: 'console' });
  host.append(root);
  return {
    update(s) {
      root.replaceChildren(
        h('div', { class: 'say', style: 'font-size:28px' }, '操作台'),
        h('div', { class: 'row' },
          h('button', { class: 'btn go', onclick: () => send('start') }, '開始路線（S）'),
          h('button', { class: 'btn', onclick: () => send('fast') }, '加速到隧道（T）'),
          h('button', { class: 'btn', onclick: () => send('again') }, '再試一個辦法（A）'),
          h('button', { class: 'btn', onclick: () => send('reset') }, '重置（R）')),
        h('div', { class: 'row' },
          h('button', { class: 'btn' + (s.offline ? ' go' : ''), onclick: () => send('offline') }, s.offline ? '離線模式：開（O）' : '離線模式：關（O）'),
          h('button', { class: 'btn' + (s.record ? ' go' : ''), onclick: () => send('record') }, s.record ? '錄影字幕：開（V）' : '錄影字幕：關（V）')),
        h('div', { class: 'kv' }, `目前步驟：${s.phase}　AI：${s.offline ? '離線' : s.aiReady ? '已連線 ' + s.model : '沒有金鑰（離線版）'}　最近一次 AI：${(s.lastLatencyMs / 1000).toFixed(1)} 秒`),
        h('ol', {}, ...s.tries.map(t => h('li', {}, `「${t.text}」${t.pass ? '直接通過' : '給兩個辦法'}，${(t.ms / 1000).toFixed(1)} 秒${t.source === 'fallback' ? '（備援三招）' : t.source === 'offline' ? '（離線）' : ''}`))));
    },
  };
}

/* ---------------- 錄影字幕（疊在車窗上） ---------------- */
function Caption(host) {
  const box = h('div', { class: 'stage-caption' });
  host.append(box);
  return {
    update(s) {
      box.replaceChildren();
      if (!s.record || !s.proposal || !s.proposal.text) return;
      const p = s.proposal;
      // 只有真的請路人即興出題時，網址加 ?improv=1 才顯示「真人即興」
      const meta = h('div', { class: 'meta' }, h('span', { class: 'badge', style: `color:${GLOW.aqua}` }, '預設規則示範'));
      if (p.pending) meta.append(h('span', { class: 'badge', style: `color:${GLOW.white}` }, '規則判斷中'));
      else if (p.source === 'fallback') meta.append(h('span', { class: 'badge', style: `color:${GLOW.petal}` }, '網路慢，改用本機三招'));
      else if (p.source === 'offline') meta.append(h('span', { class: 'badge', style: `color:${GLOW.petal}` }, '離線模式'));
      else meta.append(h('span', { class: 'badge', style: `color:${GLOW.amber}` }, '預設規則判斷'));
      box.append(h('div', { class: 'q' }, `「${p.text}」`), meta);
    },
  };
}

function soundGate(host) {
  const gate = h('button', { class: 'sound-gate', onclick: () => { soundOn = true; gate.remove(); send('start'); } }, '開始試玩（離線示範）');
  host.append(gate);
}

/* ---------------- 組畫面 ---------------- */
function mountWindow() {
  const wrap = h('div', { class: 'screen window' }, h('div', { class: 'ratio' }, h('canvas', { class: 'scene' })));
  app.append(wrap);
  const scene = createScene(wrap.querySelector('canvas'));
  const cap = Caption(wrap.querySelector('.ratio'));
  soundGate(wrap);
  views.push({ update(s) { scene.update(s); cap.update(s); speak(s); } });
}
function mountStage() {
  const frame = h('div', { class: 'stage-frame' });
  const win = h('div', { class: 'stage-window' }, h('canvas', { class: 'scene' }));
  const rear = h('div', { class: 'stage-rear' });
  const front = h('div', { class: 'stage-front' });
  const recBox = h('div', { class: 'rec' });
  frame.append(
    h('div', { class: 'stage-title' }, h('span', {}, '共創世界窗'), h('span', { class: 'sub' }, '離線互動示範・造物、立規則、接力'), recBox),
    win,
    h('div', { class: 'stage-side' }, h('div', { class: 'stage-label' }, '後座平板'), rear, h('div', { class: 'stage-label' }, '副駕螢幕'), front));
  const stage = h('div', { class: 'stage' }, frame);
  app.append(stage);
  const fit = () => { const k = Math.min(innerWidth / 1920, (innerHeight - 70) / 1080); frame.style.transform = `scale(${k})`; };
  addEventListener('resize', fit); fit();
  const scene = createScene(win.querySelector('canvas'));
  const cap = Caption(win);
  const r = RearPanel(rear), f = FrontPanel(front, false);
  soundGate(stage);
  views.push({
    update(s) {
      scene.update(s); cap.update(s); r.update(s); f.update(s); speak(s);
      recBox.replaceChildren(...(s.offline ? [h('span', { class: 'badge', style: `color:${GLOW.petal}` }, '離線模式')] : []));
    },
  });
}
function mountPanel(kind) {
  const wrap = h('div', { class: 'screen' });
  app.append(wrap);
  views.push(kind === 'rear' ? RearPanel(wrap) : kind === 'front' ? FrontPanel(wrap) : ConsolePanel(wrap));
  if (kind === 'console') wrap.style.overflow = 'auto';
}

if (SCREEN === 'window') mountWindow();
else if (SCREEN === 'stage') mountStage();
else mountPanel(SCREEN);

addEventListener('keydown', e => {
  if (!['stage', 'console', 'window'].includes(SCREEN) || e.target.tagName === 'INPUT') return;
  const map = { s: 'start', t: 'fast', r: 'reset', o: 'offline', v: 'record', a: 'again' };
  const act = map[e.key.toLowerCase()];
  if (act) send(act);
});
connect();
const toolbar = h('nav', { class: 'demo-toolbar', 'aria-label': '遊戲控制' },
  h('span', { class: 'demo-status' }, '離線示範｜不使用 API｜每頁獨立遊玩'),
  h('button', { onclick: () => send('start') }, '開始'),
  h('button', { onclick: () => send('fast') }, '進隧道'),
  h('button', { onclick: () => send('reset') }, '重新開始'));
document.body.append(toolbar);
