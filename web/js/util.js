// Small shared helpers. No dependencies.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function lerp(a, b, t) { return a + (b - a) * t; }

/** Fixed-size ring buffer of numbers, oldest first when read. */
export class Ring {
  constructor(size) { this.size = size; this.buf = new Float32Array(size).fill(NaN); this.i = 0; this.n = 0; }
  push(v) { this.buf[this.i] = v; this.i = (this.i + 1) % this.size; if (this.n < this.size) this.n++; }
  /** value k steps back (0 = newest) */
  back(k) { if (k >= this.n) return NaN; return this.buf[(this.i - 1 - k + this.size * 2) % this.size]; }
  toArray() { const out = new Float32Array(this.n); for (let k = 0; k < this.n; k++) out[k] = this.back(this.n - 1 - k); return out; }
  last() { return this.back(0); }
}

export function b64ToBytes(s) {
  if (!s) return new Uint8Array(0);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function fmt(v, digits) {
  if (v == null || Number.isNaN(v)) return '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (typeof v !== 'number') return String(v);
  if (digits === 0) return nf0.format(v);
  if (digits === 1) return nf1.format(v);
  const a = Math.abs(v);
  if (a >= 1000) return nf0.format(v);
  if (a >= 100) return nf1.format(v);
  return nf.format(v);
}

export function pct(v) { return v == null || Number.isNaN(v) ? '—' : nf0.format(v * 100) + '%'; }

/** Parses the mod's "key=value;key=value;" HUD strings into ordered pairs. */
export function parseKv(s) {
  const out = [];
  if (!s) return out;
  for (const part of String(s).split(';')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq < 0) { out.push([null, p]); continue; }
    out.push([p.slice(0, eq).trim(), p.slice(eq + 1).trim()]);
  }
  return out;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function cssVar(name, root = document.documentElement) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

/** Deterministic hash -> [0,1). Used for stable pseudo-random neuron placement. */
export function hash01(i, salt = 0) {
  let x = (i * 374761393 + salt * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177 | 0;
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967296;
}

/** Device-pixel-ratio aware canvas sizing; returns the 2d context scaled to CSS pixels. */
export function fitCanvas(canvas, cssW, cssH, maxDpr = 2) {
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, dpr, w, h };
}

/** Shared floating tooltip. */
const tip = { node: null };
export function showTip(x, y, html) {
  if (!tip.node) {
    tip.node = el('div', { class: 'tip', role: 'tooltip' });
    document.body.append(tip.node);
  }
  tip.node.innerHTML = html;
  tip.node.hidden = false;
  const r = tip.node.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
  tip.node.style.left = Math.max(8, left) + 'px';
  tip.node.style.top = Math.max(8, top) + 'px';
}
export function hideTip() { if (tip.node) tip.node.hidden = true; }

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
