// Channel x time heatmap with grouped rows and a live value column.
// Sequential single-hue ramp: surface -> hue -> deep hue.

import { fitCanvas, showTip, hideTip, escapeHtml, fmt, clamp } from './util.js';

const LABEL_W = 200, BAR_W = 96, ROW_H = 15, GROUP_H = 26, GAP = 1;

export class Heatmap {
  /**
   * @param canvas target canvas (its parent sets the width)
   * @param opts { groups:[{name,keys}], names:{key:label}, history:number, hz:number,
   *               valueLabel:(v,extra)=>string, describe:(key)=>string }
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts;
    this.history = opts.history || 600;
    this.rows = [];
    this.off = document.createElement('canvas');
    this.globalMax = 1;
    this.current = null;
    this.extra = null;
    canvas.addEventListener('mousemove', e => this.onHover(e));
    canvas.addEventListener('mouseleave', hideTip);
  }

  /** keys: the data array's key order (e.g. meta.chanNames). Builds rows from the groups. */
  setKeys(keys) {
    this.keyIndex = new Map(keys.map((k, i) => [k, i]));
    const used = new Set();
    this.blocks = [];
    this.rows = [];
    for (const g of this.opts.groups) {
      const present = g.keys.filter(k => this.keyIndex.has(k) && !used.has(k));
      if (!present.length) continue;
      present.forEach(k => used.add(k));
      this.blocks.push({ name: g.name, start: this.rows.length, count: present.length });
      present.forEach(k => this.rows.push({ key: k, index: this.keyIndex.get(k) }));
    }
    const rest = keys.filter(k => !used.has(k));
    if (rest.length) {
      this.blocks.push({ name: 'Прочее', start: this.rows.length, count: rest.length });
      rest.forEach(k => this.rows.push({ key: k, index: this.keyIndex.get(k) }));
    }
    this.off.width = this.history;
    this.off.height = this.rows.length;
    const octx = this.off.getContext('2d');
    octx.fillStyle = this.colors.surface;
    octx.fillRect(0, 0, this.history, this.rows.length);
    this.values = this.rows.map(() => new Float32Array(this.history).fill(NaN));
    this.resize();
  }

  setColors(c) {
    // c: { surface, hue, deep, ink, muted, line }
    this.colors = c;
    this.rgb = { s: hex(c.surface), h: hex(c.hue), d: hex(c.deep) };
    if (this.rows.length) {
      // repaint history with the new ramp
      const octx = this.off.getContext('2d');
      for (let r = 0; r < this.rows.length; r++) for (let x = 0; x < this.history; x++) {
        octx.fillStyle = this.color(this.values[r][x]);
        octx.fillRect(x, r, 1, 1);
      }
    }
  }

  color(v) {
    if (Number.isNaN(v)) return this.colors.surface;
    const t = clamp(Math.log1p(v) / Math.log1p(this.globalMax), 0, 1);
    const { s, h, d } = this.rgb;
    let c;
    if (t < 0.6) { const u = t / 0.6; c = s.map((x, i) => x + (h[i] - x) * u); }
    else { const u = (t - 0.6) / 0.4; c = h.map((x, i) => x + (d[i] - x) * u); }
    return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  }

  /** values: array aligned with setKeys() order; extra: optional parallel array shown in tooltips. */
  push(values, extra) {
    if (!this.rows.length || !values) return;
    this.current = values;
    this.extra = extra || null;
    let m = 0;
    for (const r of this.rows) m = Math.max(m, values[r.index] || 0);
    this.globalMax = Math.max(this.globalMax * 0.999, m, 1);
    const octx = this.off.getContext('2d');
    octx.drawImage(this.off, -1, 0);
    for (let r = 0; r < this.rows.length; r++) {
      const v = values[this.rows[r].index] || 0;
      const arr = this.values[r];
      arr.copyWithin(0, 1);
      arr[this.history - 1] = v;
      octx.fillStyle = this.color(v);
      octx.fillRect(this.history - 1, r, 1, 1);
    }
    this.dirty = true;
  }

  height() {
    return this.blocks ? this.blocks.length * GROUP_H + this.rows.length * (ROW_H + GAP) + 8 : 120;
  }

  resize() {
    const cssW = this.canvas.parentElement.clientWidth;
    const { ctx } = fitCanvas(this.canvas, cssW, this.height());
    this.ctx = ctx;
    this.cssW = cssW;
    this.dirty = true;
  }

  draw() {
    if (!this.dirty || !this.ctx || !this.rows.length) return;
    this.dirty = false;
    const ctx = this.ctx, c = this.colors;
    const heatX = LABEL_W, heatW = this.cssW - LABEL_W - BAR_W - 12;
    ctx.clearRect(0, 0, this.cssW, this.height());
    ctx.imageSmoothingEnabled = false;
    let y = 0;
    this.rowY = [];
    ctx.textBaseline = 'middle';
    for (const b of this.blocks) {
      ctx.font = '600 13px "Golos Text", system-ui, sans-serif';
      ctx.fillStyle = c.ink;
      ctx.fillText(b.name, 0, y + GROUP_H / 2 + 3);
      y += GROUP_H;
      ctx.drawImage(this.off, 0, b.start, this.history, b.count, heatX, y, heatW, b.count * (ROW_H + GAP) - GAP);
      // surface gaps between rows
      ctx.fillStyle = c.page;
      for (let k = 1; k < b.count; k++) ctx.fillRect(heatX, y + k * (ROW_H + GAP) - GAP, heatW, GAP);
      for (let k = 0; k < b.count; k++) {
        const r = this.rows[b.start + k];
        const ry = y + k * (ROW_H + GAP);
        this.rowY.push([ry, b.start + k]);
        ctx.font = '12.5px "Golos Text", system-ui, sans-serif';
        ctx.fillStyle = c.ink2;
        ctx.fillText(ellipsis(ctx, this.opts.names[r.key] || r.key, LABEL_W - 12), 0, ry + ROW_H / 2);
        const v = this.current ? this.current[r.index] || 0 : 0;
        const t = clamp(Math.log1p(v) / Math.log1p(this.globalMax), 0, 1);
        const bx = heatX + heatW + 12;
        const bw = Math.max(t > 0 ? 2 : 0, t * (BAR_W - 40));
        ctx.fillStyle = c.hue;
        roundEnd(ctx, bx, ry + 4, bw, ROW_H - 8, 2);
        ctx.fillStyle = c.muted;
        ctx.font = '11.5px "Golos Text", system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(fmt(v, v >= 10 ? 0 : 1), this.cssW, ry + ROW_H / 2);
        ctx.textAlign = 'left';
      }
      y += b.count * (ROW_H + GAP);
    }
    // time axis hint
    this.heatX = heatX; this.heatW = heatW;
  }

  onHover(e) {
    if (!this.rowY) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = this.rowY.find(([ry]) => y >= ry && y < ry + ROW_H);
    if (!hit) { hideTip(); return; }
    const row = this.rows[hit[1]];
    let col = this.history - 1;
    if (x >= this.heatX && x <= this.heatX + this.heatW) col = Math.floor((x - this.heatX) / this.heatW * this.history);
    const v = this.values[hit[1]][clamp(col, 0, this.history - 1)];
    const ago = (this.history - 1 - col) / (this.opts.hz || 10);
    const name = this.opts.names[row.key] || row.key;
    const desc = this.opts.describe ? this.opts.describe(row.key) : '';
    const extra = this.extra && col === this.history - 1 ? this.extra[row.index] : null;
    showTip(e.clientX, e.clientY,
      `<b>${escapeHtml(name)}</b>${desc ? `<br><span class="muted">${escapeHtml(desc)}</span>` : ''}` +
      `<br>${ago < 0.15 ? 'Сейчас' : `${fmt(ago, 1)} с назад`}: ${Number.isNaN(v) ? 'нет данных' : fmt(v)}` +
      (extra != null ? `<br><span class="muted">Фон: ${fmt(extra)}</span>` : '') +
      `<br><span class="muted">${escapeHtml(row.key)}</span>`);
  }
}

function hex(h) {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function ellipsis(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

/** Bar with a rounded data end and a square baseline. */
export function roundEnd(ctx, x, y, w, h, r) {
  if (w <= 0) return;
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
}
