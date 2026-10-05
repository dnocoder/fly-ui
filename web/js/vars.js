// Every internal variable the addon exports, searchable, each with a one-minute sparkline.

import { el, Ring, fmt } from './util.js';
import { VAR } from './i18n.js';

const GROUPS = [
  ['', 'Муха'],
  ['mind', 'Решения и память (FlyMind)'],
  ['mind.bus', 'Сигналы, которые мод подаёт в мозг'],
  ['entity', 'Тело и цепь побега'],
  ['entity.lastSensed', 'Что заметила цепь побега'],
  ['brain', 'Мозг целиком'],
  ['brain.loco', 'Сводка мозга для движения'],
  ['intent', 'Намерение цепи побега'],
];
const SKIP = new Set(['hud', 'hudExtra', 'state', 'debug', 'props', 'escape', 'steering', 'chanSpikes', 'outRate', 'outBase', 'uuid']);

function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k) || v == null) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      if (v.length <= 8) v.forEach((x, i) => { if (typeof x !== 'object') out.push([`${key}[${i}]`, x, prefix]); });
    } else if (typeof v === 'object') flatten(v, key, out);
    else out.push([key, v, prefix]);
  }
  return out;
}

export class VarTable {
  constructor(root, search, hz = 10) {
    this.root = root;
    this.rows = new Map();
    this.groups = new Map();
    this.filter = '';
    this.hz = hz;
    this.visible = new Set();
    this.observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) this.visible.add(e.target.dataset.key);
        else this.visible.delete(e.target.dataset.key);
      }
    });
    for (const [prefix, name] of GROUPS) {
      const body = el('tbody', { 'data-group': prefix });
      const head = el('tr', { class: 'group' }, el('th', { colspan: 3, scope: 'colgroup' }, name));
      body.append(head);
      this.groups.set(prefix, body);
      root.append(body);
    }
    search.addEventListener('input', () => { this.filter = search.value.trim().toLowerCase(); this.applyFilter(); });
    this.count = 0;
  }

  groupFor(key) {
    let best = '';
    for (const [prefix] of GROUPS) if (prefix && (key === prefix || key.startsWith(prefix + '.')) && prefix.length > best.length) best = prefix;
    if (key.startsWith('mind.bus.')) best = 'mind.bus';
    return best;
  }

  push(fly) {
    const items = flatten(fly, '', []);
    for (const [key, value] of items) {
      let row = this.rows.get(key);
      if (!row) row = this.addRow(key);
      row.value = value;
      row.ring.push(typeof value === 'number' ? value : typeof value === 'boolean' ? (value ? 1 : 0) : NaN);
    }
  }

  addRow(key) {
    const name = VAR[key];
    const label = el('th', { scope: 'row' }, name ? el('span', { class: 'vname' }, name) : null, el('code', {}, key));
    const val = el('td', { class: 'num' });
    const canvas = el('canvas', { width: 120, height: 22, class: 'spark', 'aria-hidden': 'true' });
    const tr = el('tr', { 'data-key': key }, label, val, el('td', {}, canvas));
    const row = { key, name: (name || '').toLowerCase(), tr, val, canvas, ring: new Ring(600), value: null };
    this.rows.set(key, row);
    this.groups.get(this.groupFor(key)).append(tr);
    this.observer.observe(tr);
    this.count++;
    if (this.filter) this.matchRow(row);
    return row;
  }

  matchRow(row) {
    const f = this.filter;
    row.tr.hidden = !!f && !row.key.toLowerCase().includes(f) && !row.name.includes(f);
  }

  applyFilter() {
    for (const row of this.rows.values()) this.matchRow(row);
    for (const body of this.groups.values()) {
      const any = [...body.querySelectorAll('tr[data-key]')].some(tr => !tr.hidden);
      body.hidden = !any;
    }
  }

  /** Repaints values and sparklines (rows on screen every call, all rows every other call). */
  render(colors) {
    this.pass = (this.pass || 0) + 1;
    const keys = this.pass % 2 ? this.visible : this.rows.keys();
    for (const key of keys) {
      const row = this.rows.get(key);
      if (!row || row.tr.hidden) continue;
      const v = row.value;
      row.val.textContent = typeof v === 'number' ? fmt(v) : typeof v === 'boolean' ? (v ? 'да' : 'нет') : v === '' ? '—' : String(v);
      this.spark(row, colors);
    }
  }

  spark(row, colors) {
    const ctx = row.canvas.getContext('2d');
    const w = row.canvas.width, h = row.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const r = row.ring;
    if (r.n < 2) return;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < r.n; k++) { const v = r.back(k); if (!Number.isNaN(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (!Number.isFinite(lo)) return;
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    ctx.strokeStyle = colors.ink2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = w / (r.size - 1);
    let started = false;
    for (let k = r.n - 1; k >= 0; k--) {
      const v = r.back(k);
      if (Number.isNaN(v)) { started = false; continue; }
      const x = w - 2 - k * step, y = h - 2 - (v - lo) / (hi - lo) * (h - 4);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
