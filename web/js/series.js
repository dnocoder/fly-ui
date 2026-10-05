// Small-multiple line charts over the last minute. One y-axis per chart, always.

import { el, Ring, fitCanvas, showTip, hideTip, escapeHtml, fmt } from './util.js';

export class SmallChart {
  /**
   * opts: { title, note, series:[{name, color, get(fly, snap)}], min, max, digits, hz, history, height }
   * color is a CSS variable name (e.g. '--c-sense') so theme switches recolor the chart.
   */
  constructor(parent, opts) {
    this.opts = opts;
    this.history = opts.history || 600;
    this.rings = opts.series.map(() => new Ring(this.history));
    const legend = opts.series.length > 1
      ? el('div', { class: 'legend' }, opts.series.map(s => el('span', { class: 'key' }, el('i', { class: 'swatch line', style: `background:var(${s.color})` }), s.name)))
      : null;
    this.canvas = el('canvas', { 'aria-label': opts.title, role: 'img' });
    this.valueNode = el('span', { class: 'chart-now' });
    this.root = el('figure', { class: 'chart' },
      el('figcaption', {}, el('span', { class: 'chart-title' }, opts.title), this.valueNode),
      opts.note ? el('p', { class: 'chart-note' }, opts.note) : null,
      legend,
      el('div', { class: 'chart-plot' }, this.canvas));
    parent.append(this.root);
    this.canvas.addEventListener('mousemove', e => this.onHover(e));
    this.canvas.addEventListener('mouseleave', () => { this.hoverX = null; hideTip(); this.dirty = true; });
  }

  push(fly, snap) {
    this.opts.series.forEach((s, i) => {
      let v;
      try { v = s.get(fly, snap); } catch { v = NaN; }
      this.rings[i].push(typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : NaN);
    });
    const now = this.opts.series.map((s, i) => fmt(this.rings[i].last(), this.opts.digits)).join(' / ');
    this.valueNode.textContent = now;
    this.dirty = true;
  }

  resize(colors) {
    this.colors = colors;
    const w = this.root.querySelector('.chart-plot').clientWidth;
    const { ctx } = fitCanvas(this.canvas, w, this.opts.height || 96);
    this.ctx = ctx; this.w = w; this.h = this.opts.height || 96;
    this.dirty = true;
  }

  domain() {
    let lo = this.opts.min, hi = this.opts.max;
    if (lo == null || hi == null) {
      let a = Infinity, b = -Infinity;
      for (const r of this.rings) for (let k = 0; k < r.n; k++) { const v = r.back(k); if (!Number.isNaN(v)) { a = Math.min(a, v); b = Math.max(b, v); } }
      if (!Number.isFinite(a)) { a = 0; b = 1; }
      if (lo == null) lo = a;
      if (hi == null) hi = b;
      if (hi - lo < 1e-6) { hi = lo + 1; }
      const pad = (hi - lo) * 0.08;
      if (this.opts.min == null) lo -= pad;
      if (this.opts.max == null) hi += pad;
    }
    return [lo, hi];
  }

  draw() {
    if (!this.dirty || !this.ctx) return;
    this.dirty = false;
    const ctx = this.ctx, w = this.w, h = this.h, c = this.colors;
    const padL = 0, padR = 4, padT = 6, padB = 16;
    const pw = w - padL - padR, ph = h - padT - padB;
    ctx.clearRect(0, 0, w, h);
    const [lo, hi] = this.domain();
    const yOf = v => padT + ph - (v - lo) / (hi - lo) * ph;
    // hairline grid: bottom, middle, top
    ctx.strokeStyle = c.line; ctx.lineWidth = 1;
    ctx.fillStyle = c.muted; ctx.font = '11px "Golos Text", system-ui, sans-serif';
    for (const v of [lo, (lo + hi) / 2, hi]) {
      const y = Math.round(yOf(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
    }
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(lo, this.opts.digits), padL, h - padB + 3);
    ctx.textAlign = 'right';
    ctx.fillText('сейчас', padL + pw, h - padB + 3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fmt(hi, this.opts.digits), padL + 2, padT + 10);
    const step = pw / (this.history - 1);
    this.opts.series.forEach((s, i) => {
      const r = this.rings[i];
      ctx.strokeStyle = cssColor(s.color);
      ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      for (let k = r.n - 1; k >= 0; k--) {
        const v = r.back(k);
        const x = padL + pw - k * step;
        if (Number.isNaN(v)) { started = false; continue; }
        const y = yOf(Math.min(hi, Math.max(lo, v)));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const last = r.last();
      if (!Number.isNaN(last)) {
        ctx.fillStyle = c.page;
        ctx.beginPath(); ctx.arc(padL + pw, yOf(Math.min(hi, Math.max(lo, last))), 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cssColor(s.color);
        ctx.beginPath(); ctx.arc(padL + pw, yOf(Math.min(hi, Math.max(lo, last))), 4, 0, Math.PI * 2); ctx.fill();
      }
    });
    if (this.hoverX != null) {
      ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(this.hoverX) + 0.5, padT); ctx.lineTo(Math.round(this.hoverX) + 0.5, padT + ph); ctx.stroke();
    }
    this.geom = { padL, pw, step };
  }

  onHover(e) {
    if (!this.geom) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const k = Math.round((this.geom.padL + this.geom.pw - x) / this.geom.step);
    if (k < 0 || k >= this.rings[0].n) { hideTip(); return; }
    this.hoverX = this.geom.padL + this.geom.pw - k * this.geom.step;
    this.dirty = true;
    const ago = k / (this.opts.hz || 10);
    const rows = this.opts.series.map((s, i) =>
      `<span class="key"><i class="swatch line" style="background:var(${s.color})"></i>${escapeHtml(s.name)}: ${fmt(this.rings[i].back(k), this.opts.digits)}</span>`).join('<br>');
    showTip(e.clientX, e.clientY, `<b>${escapeHtml(this.opts.title)}</b><br>${ago < 0.15 ? 'Сейчас' : fmt(ago, 1) + ' с назад'}<br>${rows}`);
  }
}

function cssColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
}
