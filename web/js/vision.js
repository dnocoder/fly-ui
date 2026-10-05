// What the fly faces (addon ray-cast panorama) and what her brain is actually fed.

import { el, b64ToBytes, fitCanvas, showTip, hideTip, escapeHtml, fmt, clamp } from './util.js';
import { PROP_KIND } from './i18n.js';

export const ENTITY_RU = {
  player: 'игрок', zombie: 'зомби', skeleton: 'скелет', creeper: 'крипер', spider: 'паук', cave_spider: 'пещерный паук',
  frog: 'лягушка', cat: 'кошка', ocelot: 'оцелот', fox: 'лиса', wolf: 'волк', bee: 'пчела', chicken: 'курица',
  cow: 'корова', pig: 'свинья', sheep: 'овца', villager: 'житель', witch: 'ведьма', slime: 'слизень', bat: 'летучая мышь',
  connectome_fly: 'другая муха', fly_egg: 'яйцо мухи', item: 'предмет', arrow: 'стрела', drowned: 'утопленник',
  husk: 'кадавр', enderman: 'эндермен', phantom: 'фантом', parrot: 'попугай', axolotl: 'аксолотль', rabbit: 'кролик',
};

const KIND_NAMES = ['небо', 'блок', 'существо', 'угроза', 'другая муха', 'игрок'];

export function entityRu(name) {
  if (!name) return '?';
  return ENTITY_RU[name] || name.replace(/_/g, ' ');
}

export class EyeView {
  constructor(canvas) {
    this.canvas = canvas;
    this.v = null;
    canvas.addEventListener('mousemove', e => this.onHover(e));
    canvas.addEventListener('mouseleave', hideTip);
  }

  set(v) {
    if (!v) return;
    this.v = {
      ...v,
      rgb: typeof v.rgb === 'string' ? b64ToBytes(v.rgb) : v.rgb,
      depth: typeof v.depth === 'string' ? b64ToBytes(v.depth) : v.depth,
      kind: typeof v.kind === 'string' ? b64ToBytes(v.kind) : v.kind,
    };
    this.dirty = true;
  }

  resize(colors) {
    this.colors = colors;
    const w = this.canvas.parentElement.clientWidth;
    const h = Math.round(w * 0.46);
    const { ctx } = fitCanvas(this.canvas, w, h);
    this.ctx = ctx; this.w = w; this.h = h;
    this.dirty = true;
  }

  draw() {
    if (!this.dirty || !this.ctx) return;
    this.dirty = false;
    const { ctx, w, h, colors } = this;
    ctx.fillStyle = colors.well;
    ctx.fillRect(0, 0, w, h);
    const v = this.v;
    if (!v) {
      ctx.fillStyle = colors.wellMuted;
      ctx.font = '13px "Golos Text", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ждём первый кадр зрения…', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }
    const top = 18, bottom = 20;
    const ph = h - top - bottom;
    const cw = w / v.w, ch = ph / v.h;
    const r = Math.min(cw, ch * 1.12) * 0.56;
    // ommatidia: hexagonally offset rows of round facets
    for (let y = 0; y < v.h; y++) {
      const off = (y % 2) * cw * 0.5;
      for (let x = 0; x < v.w; x++) {
        const i = y * v.w + x;
        const k = v.kind[i];
        ctx.fillStyle = `rgb(${v.rgb[i * 3]},${v.rgb[i * 3 + 1]},${v.rgb[i * 3 + 2]})`;
        const cx = x * cw + cw / 2 + off - cw * 0.25;
        const cy = top + y * ch + ch / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, k >= 2 ? r * 1.05 : r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // direction ticks
    const azToX = az => (az - v.az0) / (v.az1 - v.az0) * w;
    ctx.font = '11.5px "Golos Text", system-ui, sans-serif';
    ctx.fillStyle = colors.wellInk;
    ctx.textAlign = 'center';
    for (const [az, label] of [[-90, 'слева'], [0, 'впереди'], [90, 'справа']]) {
      const x = azToX(az);
      ctx.fillRect(Math.round(x), top - 4, 1, 4);
      ctx.fillText(label, x, top - 6);
    }
    ctx.fillStyle = colors.wellMuted;
    ctx.textAlign = 'left';
    ctx.fillText('сзади', 4, top - 6);
    ctx.textAlign = 'right';
    ctx.fillText('сзади', w - 4, top - 6);
    // entity labels
    ctx.textAlign = 'center';
    for (const e of v.entities || []) {
      if (!e.visible) continue;
      const x = azToX(e.az);
      const y = top + (v.el1 - e.el) / (v.el1 - v.el0) * ph;
      const rad = Math.max(8, e.size / (v.az1 - v.az0) * w * 0.5);
      ctx.strokeStyle = e.kind === 3 ? colors.wellAct : colors.wellInk;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
      const label = `${entityRu(e.name)}, ${fmt(e.dist, 0)} м`;
      const ly = y - rad - 6 < top + 10 ? y + rad + 14 : y - rad - 6;
      ctx.fillStyle = colors.well;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(x - tw / 2 - 4, ly - 11, tw + 8, 15);
      ctx.fillStyle = colors.wellInk;
      ctx.fillText(label, x, ly);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.wellMuted;
    ctx.fillText(`Видно на ${fmt(v.range, 0)} блоков вокруг. Сетка ${v.w}×${v.h} фасеток.`, 4, h - 6);
  }

  onHover(e) {
    const v = this.v;
    if (!v) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const top = 18, ph = this.h - 38;
    const gx = clamp(Math.floor(x / this.w * v.w), 0, v.w - 1);
    const gy = Math.floor((y - top) / ph * v.h);
    if (gy < 0 || gy >= v.h) { hideTip(); return; }
    const i = gy * v.w + gx;
    const az = v.az0 + (gx + 0.5) * (v.az1 - v.az0) / v.w;
    const elv = v.el1 - (gy + 0.5) * (v.el1 - v.el0) / v.h;
    const d = v.depth[i] === 255 ? null : v.depth[i] / 254 * v.range;
    showTip(e.clientX, e.clientY,
      `<b>${KIND_NAMES[v.kind[i]] || '?'}</b>` +
      `<br>${az < -5 ? `${fmt(-az, 0)}° левее` : az > 5 ? `${fmt(az, 0)}° правее` : 'прямо по курсу'}, ${elv > 5 ? `на ${fmt(elv, 0)}° выше` : elv < -5 ? `на ${fmt(-elv, 0)}° ниже` : 'на уровне глаз'}` +
      (d != null ? `<br>Расстояние ≈ ${fmt(d, 1)} блока` : ''));
  }
}

/** Mirrored left/right bars for the visual channels the brain receives. */
export class VisualInputs {
  constructor(root) {
    this.root = root;
    this.rows = [
      { name: 'Мелкий движущийся объект', l: ['chan', 'small_object_left'], r: ['chan', 'small_object_right'] },
      { name: 'Ориентир (полоса, ствол)', l: ['chan', 'landmark_left'], r: ['chan', 'landmark_right'] },
      { name: 'Поток назад (идёт вперёд)', l: ['chan', 'motion_prog_left'], r: ['chan', 'motion_prog_right'] },
      { name: 'Поток вперёд', l: ['chan', 'motion_reg_left'], r: ['chan', 'motion_reg_right'] },
      { name: 'Клетки горизонтального движения', l: ['out', 'hs_left'], r: ['out', 'hs_right'] },
      { name: 'Детекторы мелочи в мозге', l: ['out', 'lc_small_left'], r: ['out', 'lc_small_right'] },
    ];
    this.max = 20;
    this.nodes = this.rows.map(row => {
      const lb = el('i', { class: 'mbar l' }), rb = el('i', { class: 'mbar r' });
      const lv = el('span', { class: 'mval l' }), rv = el('span', { class: 'mval r' });
      const line = el('div', { class: 'mirror' }, lv, el('span', { class: 'mtrack l' }, lb), el('span', { class: 'mname' }, row.name), el('span', { class: 'mtrack r' }, rb), rv);
      root.append(line);
      return { lb, rb, lv, rv };
    });
    this.loom = el('p', { class: 'loom' });
    root.append(this.loom);
  }

  update(fly, meta) {
    const loco = fly.brain && fly.brain.loco;
    if (!loco || !meta) return;
    const chanAt = k => { const i = meta.chanNames.indexOf(k); return i >= 0 && loco.chanSpikes ? loco.chanSpikes[i] || 0 : 0; };
    const outAt = k => { const i = meta.outNames.indexOf(k); return i >= 0 && loco.outRate ? loco.outRate[i] || 0 : 0; };
    const get = ([src, k]) => src === 'chan' ? chanAt(k) : outAt(k);
    let m = 1;
    const vals = this.rows.map(row => { const a = get(row.l), b = get(row.r); m = Math.max(m, a, b); return [a, b]; });
    this.max = Math.max(this.max * 0.995, m);
    vals.forEach(([a, b], i) => {
      const n = this.nodes[i];
      n.lb.style.width = `${clamp(Math.log1p(a) / Math.log1p(this.max), 0, 1) * 100}%`;
      n.rb.style.width = `${clamp(Math.log1p(b) / Math.log1p(this.max), 0, 1) * 100}%`;
      n.lv.textContent = fmt(a, a >= 10 ? 0 : 1);
      n.rv.textContent = fmt(b, b >= 10 ? 0 : 1);
    });
    const s = fly.entity && fly.entity.lastSensed;
    if (s && s.threatFound) {
      this.loom.textContent = `Надвигается ${entityRu(s.threatName ? s.threatName.replace(/^(a|an|the) /, '') : '')}: ${fmt(s.threatDist, 1)} м, сила надвигания ${fmt(s.threatLoom)}.`;
      this.loom.classList.add('alert');
    } else {
      this.loom.textContent = 'Ничего не надвигается.';
      this.loom.classList.remove('alert');
    }
  }
}

/** Top-down map of things the fly noticed (FlyMind.blockProps), forward is up. */
export class Radar {
  constructor(canvas) {
    this.canvas = canvas;
    this.props = [];
    this.range = 16;
    canvas.addEventListener('mousemove', e => this.onHover(e));
    canvas.addEventListener('mouseleave', hideTip);
  }

  resize(colors) {
    this.colors = colors;
    const w = this.canvas.parentElement.clientWidth;
    const { ctx } = fitCanvas(this.canvas, w, Math.min(w, 300));
    this.ctx = ctx; this.w = w; this.h = Math.min(w, 300);
    this.dirty = true;
  }

  set(fly) {
    const yaw = (fly.yaw || 0) * Math.PI / 180;
    const fx = -Math.sin(yaw), fz = Math.cos(yaw);
    const rx = -Math.cos(yaw), rz = -Math.sin(yaw);
    this.props = (fly.props || []).map(p => ({
      ...p,
      fwd: p.dx * fx + p.dz * fz,
      side: p.dx * rx + p.dz * rz,
    }));
    this.dirty = true;
  }

  draw() {
    if (!this.dirty || !this.ctx) return;
    this.dirty = false;
    const { ctx, w, h, colors } = this;
    ctx.fillStyle = colors.well;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 14;
    const scale = R / this.range;
    ctx.strokeStyle = colors.wellLine; ctx.lineWidth = 1;
    ctx.fillStyle = colors.wellMuted;
    ctx.font = '11px "Golos Text", system-ui, sans-serif';
    for (const d of [4, 8, 16]) {
      ctx.beginPath(); ctx.arc(cx, cy, d * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.fillText(`${d} м`, cx + 3, cy - d * scale + 12);
    }
    // the fly, pointing forward (up)
    ctx.fillStyle = colors.wellInk;
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 5, cy + 6); ctx.lineTo(cx - 5, cy + 6); ctx.closePath(); ctx.fill();
    this.hits = [];
    ctx.textBaseline = 'middle';
    for (const p of this.props) {
      const dist = Math.hypot(p.fwd, p.side);
      const k = dist > this.range ? this.range / dist : 1;
      const x = cx + p.side * scale * k, y = cy - p.fwd * scale * k;
      const info = PROP_KIND[p.kind] || { name: p.kind, tone: 'neutral' };
      ctx.fillStyle = colors.wellInk; ctx.strokeStyle = colors.wellInk; ctx.lineWidth = 1.5;
      if (info.tone === 'attract') { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
      else if (info.tone === 'avoid') {
        ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
      } else { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = colors.wellInk;
      ctx.fillText(info.name, x + 9, y);
      this.hits.push({ x, y, p, info, dist });
    }
    ctx.textBaseline = 'alphabetic';
    if (!this.props.length) {
      ctx.fillStyle = colors.wellMuted; ctx.textAlign = 'center';
      ctx.fillText('Рядом ничего примечательного', cx, h - 10);
      ctx.textAlign = 'left';
    }
  }

  onHover(e) {
    if (!this.hits) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = this.hits.find(h => Math.hypot(h.x - x, h.y - y) < 12);
    if (!hit) { hideTip(); return; }
    const p = hit.p;
    const where = `${fmt(Math.abs(p.fwd), 1)} м ${p.fwd >= 0 ? 'впереди' : 'позади'}, ${fmt(Math.abs(p.side), 1)} м ${p.side >= 0 ? 'справа' : 'слева'}`;
    showTip(e.clientX, e.clientY, `<b>${escapeHtml(hit.info.name)}</b><br>${where}` +
      (p.entity ? `<br>${escapeHtml(entityRu(p.entity))}` : '') +
      (p.effect ? `<br><span class="muted">${escapeHtml(p.effect)}${p.channel ? `, канал ${escapeHtml(p.channel)}` : ''}</span>` : ''));
  }
}
