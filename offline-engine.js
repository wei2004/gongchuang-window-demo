// Browser-only demo: each page owns its game. No API, storage or network calls.
export const RULES = ['只能走水路', '不能碰陸地', '只能用飛的'];
const OPTIONS = {
  water: [
    { text: '可以，但要先下一場大雨，接出一條水路', effect: 'rain' },
    { text: '可以，但要先變成一艘會發光的小船', effect: 'boat' },
  ],
  air: [
    { text: '可以，但要先讓雲朵來接你', effect: 'cloud' },
    { text: '可以，但要先長出翅膀，飛到對岸', effect: 'fly' },
  ],
  landless: [
    { text: '可以，但要先在河上吹一串泡泡橋', effect: 'bubbleBridge' },
    { text: '可以，但要先變成一艘會發光的小船', effect: 'boat' },
  ],
};
export class OfflineGame {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.listeners = new Set();
    this.sayId = 0;
    this.epoch = 0;
    this.lastTick = this.now();
    this.arriveAt = null;
    this.state = this.freshState();
  }
  freshState() {
    return {
      phase: 'idle', route: { running: false, km: 2, total: 2, night: false, fast: false },
      goal: '進隧道前，把角色送到對岸', terrain: '這一幕有一條河',
      character: null, rule: null, proposal: null, chosen: null, tries: [],
      say: null, notice: '', offline: true, record: false,
      lastLatencyMs: 0, aiReady: false, model: '', rules: [...RULES], epoch: ++this.epoch,
    };
  }
  snapshot() { return structuredClone(this.state); }
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }
  emit() { this.listeners.forEach(listener => listener(this.snapshot())); }
  say(text) { this.state.say = { id: ++this.sayId, text }; }
  tick() {
    const now = this.now();
    const dt = Math.max(0, now - this.lastTick) / 1000;
    this.lastTick = now;
    const s = this.state;
    let changed = false;
    if (s.route.running && !s.route.night) {
      s.route.km = Math.max(0, s.route.km - (2 / 90) * dt * (s.route.fast ? 40 : 1));
      if (s.route.km <= 0) {
        s.route.night = true; s.route.fast = false;
        if (s.character) this.say(`進隧道了。${s.character.name || '角色'}發光，繼續走。`);
      }
      changed = true;
    }
    if (this.arriveAt !== null && now >= this.arriveAt) {
      this.arriveAt = null;
      if (s.phase === 'crossing') {
        s.phase = 'arrived'; this.say(`${s.character.name}到對岸了！`); changed = true;
      }
    }
    if (changed) this.emit();
  }
  act(action, data = {}) {
    this.tick();
    const s = this.state;
    switch (action) {
      case 'start':
        s.route.running = true;
        if (s.phase === 'idle') { s.phase = 'create'; this.say('這一幕有一條河。畫一個角色，一起想辦法過河。'); }
        break;
      case 'fast': s.route.fast = true; break;
      case 'reset':
        this.arriveAt = null; this.state = this.freshState(); this.lastTick = this.now(); break;
      case 'record': s.record = !s.record; break;
      case 'offline': break; // This build always stays offline.
      case 'drawDone':
        if (s.phase !== 'create') return;
        s.character = { name: '', guess: '鯨魚', traits: ['會游泳'], strokes: structuredClone((data.strokes || []).slice(0, 400)) };
        s.phase = 'confirm'; s.notice = '離線版不辨識圖畫，請確認或輸入你的角色名字。';
        this.say('幫你畫的角色取個名字吧。'); break;
      case 'confirmGuess':
        if (!s.character || s.phase !== 'confirm') return;
        s.character.name = String(data.name || s.character.guess).trim().slice(0, 8) || '鯨魚';
        s.phase = 'rule'; s.notice = ''; this.say(`好，${s.character.name}加入了！`); break;
      case 'setRule':
        if (!s.character?.name || !RULES.includes(data.text) || !['rule', 'relay', 'choose', 'arrived'].includes(s.phase)) return;
        this.arriveAt = null;
        s.rule = { text: data.text }; s.phase = 'relay'; s.proposal = null; s.chosen = null; s.notice = '';
        this.say(`新規則：${data.text}。`); break;
      case 'propose': {
        const text = String(data.text || '').trim().slice(0, 40);
        if (!text || !s.character?.name || !s.rule || s.phase !== 'relay') return;
        const re = s.rule.text === RULES[0] ? /水|游|泳|船|河|雨|浪|潛/
          : s.rule.text === RULES[1] ? /飛|雲|船|游|泳|泡泡|跳|氣球|水|翅膀/
          : /飛|雲|氣球|翅膀|風箏|火箭/;
        const pass = re.test(text);
        const kind = s.rule.text === RULES[0] ? 'water' : s.rule.text === RULES[1] ? 'landless' : 'air';
        const result = {
          pass, reason: pass ? '示範關鍵字符合規則，可以過去！' : '',
          effect: pass ? (/飛|雲|氣球|翅膀|風箏|火箭/.test(text) ? 'fly' : 'boat') : '',
          options: pass ? [] : structuredClone(OPTIONS[kind]), source: 'offline',
        };
        s.proposal = { text, ms: 0, ...result }; s.chosen = null; s.notice = ''; s.phase = 'choose';
        s.tries.push({ text, pass, ms: 0, source: 'offline' });
        this.say(pass ? '可以，準備出發！' : '可以，但要先改變一下。選一個辦法吧。'); break;
      }
      case 'choose': {
        if (s.phase !== 'choose' || !s.proposal) return;
        const choice = data.index === -1 && s.proposal.pass
          ? { text: s.proposal.reason, effect: s.proposal.effect }
          : s.proposal.options[data.index];
        if (!choice) return;
        s.chosen = { ...choice }; s.phase = 'crossing'; this.arriveAt = this.now() + 4200; break;
      }
      case 'again':
        if (!s.character || !s.rule || !['arrived', 'choose', 'relay'].includes(s.phase)) return;
        this.arriveAt = null; s.phase = 'relay'; s.proposal = null; s.chosen = null; s.notice = ''; break;
      default: return;
    }
    this.emit();
  }
}
