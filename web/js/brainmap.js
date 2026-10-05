// The whole-brain map: every neuron is one point in a schematic (not anatomical) fly
// brain, lit by its live activity. Position encodes function, hue encodes class,
// brightness encodes how fast the neuron is firing right now.

import { b64ToBytes, hash01, fitCanvas, showTip, hideTip, escapeHtml, clamp } from './util.js';
import { CHANNEL, OUTPUT, NEURON_CLASS } from './i18n.js';

export const CLASS = { SENSE: 0, CORE: 1, ACT: 2, MOD: 3 };
const CLASS_KEYS = ['sense', 'core', 'act', 'mod'];

const W = 1000, H = 640; // logical layout box

// Where each family of neurons sits. Ellipses: [cx, cy, rx, ry].
const R = {
  brain: [500, 215, 245, 150],
  lobeL: [150, 215, 92, 132],
  lobeR: [850, 215, 92, 132],
  calyxL: [395, 105, 46, 34],
  calyxR: [605, 105, 46, 34],
  piCells: [500, 92, 30, 18],
  clockL: [300, 150, 26, 22],
  clockR: [700, 150, 26, 22],
  fanSleep: [500, 168, 62, 16],
  epg: [500, 218, 34, 34],
  pfl: [500, 262, 30, 10],
  antL: [432, 326, 44, 26],
  antR: [568, 326, 44, 26],
  ammcL: [352, 312, 32, 22],
  ammcR: [648, 312, 32, 22],
  climate: [500, 300, 26, 14],
  sez: [500, 382, 84, 26],
  neck: [500, 432, 16, 22],
  vnc: [500, 548, 92, 86],
};

export const REGION_LABELS = [
  ['Зрительная доля, левая', 150, 66, 'center'],
  ['Зрительная доля, правая', 850, 66, 'center'],
  ['Грибовидные тела', 500, 50, 'center'],
  ['Компас', 544, 214, 'left'],
  ['Антеннальные доли', 384, 350, 'right'],
  ['Шейная связка', 526, 436, 'left'],
  ['Нервная цепочка', 600, 520, 'left'],
  ['лапки и крылья', 600, 536, 'left'],
];

/** Small structures that ordinary interneurons should not cover. */
const RESERVED = [
  [500, 218, 40, 40], [395, 105, 47, 35], [605, 105, 47, 35],
  [500, 168, 63, 17], [500, 262, 31, 11], [452, 168, 21, 13], [548, 168, 21, 13], [430, 186, 27, 15], [570, 186, 27, 15],
  [500, 92, 31, 19], [300, 150, 27, 23], [700, 150, 27, 23], [470, 238, 11, 9], [530, 238, 11, 9],
];
function reserved(p) {
  for (const [cx, cy, rx, ry] of RESERVED) {
    const dx = (p[0] - cx) / rx, dy = (p[1] - cy) / ry;
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}
function freeInEllipse(e, i, salt) {
  let p = inEllipse(e, i, salt);
  for (let k = 1; k < 8 && reserved(p); k++) p = inEllipse(e, i, salt + k * 101);
  return p;
}

const SIDED_VISION_L = ['motion_prog_left', 'motion_reg_left', 'small_object_left', 'landmark_left'];
const SIDED_VISION_R = ['motion_prog_right', 'motion_reg_right', 'small_object_right', 'landmark_right'];
const SMELL = ['olf_food', 'olf_fruit', 'olf_co2', 'pheromone', 'aversive'];
const TASTE = ['gust_sugar', 'taste_sugar_leg', 'taste_sugar_labellum', 'taste_bitter_leg', 'taste_bitter_labellum', 'taste_water'];
const HEARING = ['auditory', 'wind', 'song', 'song_pc1'];
const CLIMATE = ['heating', 'cooling', 'humid', 'dry'];
const MOD_OUT = ['epg', 'pfl3_left', 'pfl3_right', 'mbon_avoid', 'mbon_approach', 'pam', 'ppl1', 'dfb_sleep', 'ipc', 'clock', 'clock_morning', 'clock_evening', 'pc1_receptive', 'pc1_aggr', 'vpoen'];
const VISION_OUT = ['lc_small_left', 'lc_small_right', 'lc_bar_left', 'lc_bar_right', 'hs_left', 'hs_right', 'vs_left', 'vs_right'];

function inEllipse(e, i, salt) {
  const u = hash01(i, salt), v = hash01(i, salt + 1);
  const r = Math.sqrt(u), a = v * Math.PI * 2;
  return [e[0] + Math.cos(a) * r * e[2], e[1] + Math.sin(a) * r * e[3]];
}

function pick(i, salt, a, b) { return hash01(i, salt) < 0.5 ? a : b; }

/** VNC slot for a leg neuromere: 0 front, 1 middle, 2 hind; side -1 left, +1 right, 0 either. */
function vncLeg(i, row, side) {
  const s = side || (hash01(i, 71) < 0.5 ? -1 : 1);
  const cy = 500 + row * 44;
  const cx = 500 + s * 46;
  return inEllipse([cx, cy, 38, 17], i, 73);
}

/** Computes positions, class and group for every neuron from the brain metadata. */
export function layoutBrain(meta) {
  const n = meta.n;
  const x = new Float32Array(n), y = new Float32Array(n);
  const cls = new Uint8Array(n).fill(CLASS.CORE);
  const group = new Int16Array(n).fill(-1); // >=0: channel index; <= -2: -(output index)-2
  const sensory = b64ToBytes(meta.sensory);
  const kc = b64ToBytes(meta.isKC);
  const dn = b64ToBytes(meta.dnclass);
  const chanNames = meta.chanNames || [];
  const outNames = meta.outNames || [];

  // channel membership (first channel wins)
  const chanOf = new Int16Array(n).fill(-1);
  (meta.chanIdx || []).forEach((ids, c) => { for (const i of ids) if (chanOf[i] < 0) chanOf[i] = c; });
  // output membership: generic groups first, sided ones overwrite
  const outOf = new Int16Array(n).fill(-1);
  const order = outNames.map((k, o) => [k, o]).sort((a, b) => (/_(left|right)$/.test(a[0]) ? 1 : 0) - (/_(left|right)$/.test(b[0]) ? 1 : 0));
  for (const [, o] of order) for (const i of (meta.outIdx[o] || [])) outOf[i] = o;
  const epgAngle = new Map();
  (meta.epgIdx || []).forEach((i, k) => epgAngle.set(i, meta.epgAngle[k]));

  const counts = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    let p;
    const c = chanOf[i];
    const o = outOf[i];
    const cname = c >= 0 ? chanNames[c] : null;
    const oname = o >= 0 ? outNames[o] : null;
    if (epgAngle.has(i)) {
      const a = epgAngle.get(i);
      const rr = 30 + hash01(i, 5) * 6;
      p = [R.epg[0] + Math.cos(a) * rr, R.epg[1] + Math.sin(a) * rr];
      cls[i] = CLASS.MOD; group[i] = -o - 2;
    } else if (oname && (oname.startsWith('mn_') || oname.startsWith('dn_'))) {
      cls[i] = CLASS.ACT; group[i] = -o - 2;
      if (oname.startsWith('dn_')) p = inEllipse(R.neck, i, 21);
      else if (oname.startsWith('mn_leg_front')) p = vncLeg(i, 0, oname.endsWith('left') ? -1 : oname.endsWith('right') ? 1 : 0);
      else if (oname.startsWith('mn_leg_middle')) p = vncLeg(i, 1, oname.endsWith('left') ? -1 : oname.endsWith('right') ? 1 : 0);
      else if (oname.startsWith('mn_leg_hind')) p = vncLeg(i, 2, oname.endsWith('left') ? -1 : oname.endsWith('right') ? 1 : 0);
      else if (oname === 'mn_jump') p = inEllipse([500, 525, 10, 8], i, 23);
      else if (oname.startsWith('mn_wing') || oname.startsWith('mn_haltere')) {
        const s = oname.endsWith('left') ? -1 : oname.endsWith('right') ? 1 : (hash01(i, 24) < 0.5 ? -1 : 1);
        p = inEllipse([500 + s * 14, oname.startsWith('mn_haltere') ? 590 : 548, 10, 22], i, 25);
      } else if (oname.startsWith('mn_neck')) {
        const s = oname.endsWith('left') ? -1 : oname.endsWith('right') ? 1 : (hash01(i, 26) < 0.5 ? -1 : 1);
        p = inEllipse([500 + s * 34, 474, 26, 8], i, 27);
      } else if (oname === 'mn_proboscis' || oname === 'mn_pharynx') p = inEllipse([500, 398, 40, 10], i, 28);
      else if (oname === 'mn_antenna') p = inEllipse(pick(i, 29, R.antL, R.antR), i, 30);
      else if (oname === 'mn_respiratory' || oname === 'mn_ovulation') p = inEllipse([500, 615, 30, 14], i, 31);
      else p = inEllipse(R.vnc, i, 32);
    } else if (oname && MOD_OUT.includes(oname)) {
      cls[i] = CLASS.MOD; group[i] = -o - 2;
      if (oname.startsWith('pfl3')) p = inEllipse(R.pfl, i, 33);
      else if (oname.startsWith('mbon')) p = inEllipse(pick(i, 34, [452, 168, 20, 12], [548, 168, 20, 12]), i, 35);
      else if (oname === 'pam' || oname === 'ppl1') p = inEllipse(pick(i, 36, [430, 186, 26, 14], [570, 186, 26, 14]), i, 37);
      else if (oname === 'dfb_sleep') {
        const a = Math.PI * (1.15 + hash01(i, 38) * 0.7);
        const rr = 52 + hash01(i, 39) * 14;
        p = [500 + Math.cos(a) * rr, 228 + Math.sin(a) * rr];
      } else if (oname === 'ipc') p = inEllipse(R.piCells, i, 40);
      else if (oname.startsWith('clock')) p = inEllipse(pick(i, 41, R.clockL, R.clockR), i, 42);
      else p = inEllipse([500, 140, 40, 14], i, 43);
    } else if (kc[i]) {
      cls[i] = CLASS.MOD;
      // calyx (most cells) or the stalk running toward the midline
      const left = hash01(i, 44) < 0.5;
      if (hash01(i, 45) < 0.72) p = inEllipse(left ? R.calyxL : R.calyxR, i, 46);
      else {
        const t = hash01(i, 47);
        const sx = left ? 395 : 605, ex = left ? 470 : 530;
        p = [sx + (ex - sx) * t + (hash01(i, 48) - 0.5) * 8, 128 + 52 * t + (hash01(i, 49) - 0.5) * 8];
      }
    } else if (sensory[i] || cname) {
      cls[i] = CLASS.SENSE; group[i] = c;
      if (SIDED_VISION_L.includes(cname)) p = inEllipse(R.lobeL, i, 50);
      else if (SIDED_VISION_R.includes(cname)) p = inEllipse(R.lobeR, i, 51);
      else if (cname === 'visual' || cname === 'light_clock') p = inEllipse(pick(i, 52, R.lobeL, R.lobeR), i, 53);
      else if (SMELL.includes(cname)) p = inEllipse(pick(i, 54, R.antL, R.antR), i, 55);
      else if (TASTE.includes(cname)) p = inEllipse(R.sez, i, 56);
      else if (HEARING.includes(cname)) p = inEllipse(pick(i, 57, R.ammcL, R.ammcR), i, 58);
      else if (CLIMATE.includes(cname)) p = inEllipse(R.climate, i, 59);
      else if (cname === 'tactile') p = vncLeg(i, Math.floor(hash01(i, 60) * 3), 0);
      else if (cname === 'pen_left' || cname === 'pen_right') p = inEllipse([cname === 'pen_left' ? 470 : 530, 238, 10, 8], i, 61);
      else if (cname === 'reward' || cname === 'punishment') p = inEllipse(pick(i, 62, [430, 186, 26, 14], [570, 186, 26, 14]), i, 63);
      else if (cname === 'clock_morning' || cname === 'clock_evening') p = inEllipse(pick(i, 64, R.clockL, R.clockR), i, 65);
      else if (cname === 'nutrient' || cname === 'sleep_pressure' || cname === 'aggression_pc1') p = inEllipse(R.piCells, i, 66);
      else p = freeInEllipse(R.brain, i, 67);
    } else if (oname && VISION_OUT.includes(oname)) {
      group[i] = -o - 2;
      const left = oname.endsWith('left');
      p = inEllipse(left ? [232, 215, 26, 90] : [768, 215, 26, 90], i, 68);
    } else {
      // ordinary interneuron: most in the central brain, some in the optic lobes and the VNC
      const r = hash01(i, 69);
      if (r < 0.26) p = inEllipse(pick(i, 70, R.lobeL, R.lobeR), i, 74);
      else if (r < 0.40) p = inEllipse(R.vnc, i, 75);
      else p = freeInEllipse(R.brain, i, 76);
    }
    x[i] = p[0];
    y[i] = p[1];
    counts[cls[i]]++;
  }
  return { n, x, y, cls, group, counts, meta };
}

/** Renders the map into a canvas and keeps it lit from activity frames. */
export class BrainMap {
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.palette = palette; // { well:[r,g,b], classes:[[r,g,b] x4] }
    this.layout = null;
    this.level = null; // smoothed 0..1 per neuron
    this.target = null;
    this.chanLevel = null;
    this.sharp = document.createElement('canvas');
    this.labels = true;
    this.frame = 0;
    this.hoverIndex = -1;
    canvas.addEventListener('mousemove', e => this.onHover(e));
    canvas.addEventListener('mouseleave', () => { this.hoverIndex = -1; hideTip(); });
  }

  setLayout(layout) {
    this.layout = layout;
    this.level = new Float32Array(layout.n);
    this.target = new Float32Array(layout.n);
    this.resize();
  }

  setPalette(p) { this.palette = p; this.buildBase(); }

  resize() {
    if (!this.layout) return;
    const cssW = this.canvas.parentElement.clientWidth;
    const cssH = Math.round(cssW * H / W);
    const { dpr, w, h } = fitCanvas(this.canvas, cssW, cssH);
    this.dpr = dpr; this.pw = w; this.ph = h; this.cssW = cssW; this.cssH = cssH;
    this.sharp.width = w; this.sharp.height = h;
    const { x, y, n } = this.layout;
    this.pix = new Int32Array(n);
    const sx = w / W, sy = h / H;
    for (let i = 0; i < n; i++) {
      const px = clamp(Math.round(x[i] * sx), 0, w - 1), py = clamp(Math.round(y[i] * sy), 0, h - 1);
      this.pix[i] = py * w + px;
    }
    // hover grid in logical units
    this.cell = 8;
    this.gw = Math.ceil(W / this.cell); this.gh = Math.ceil(H / this.cell);
    const buckets = new Array(this.gw * this.gh);
    for (let i = 0; i < n; i++) {
      const k = Math.min(this.gh - 1, Math.floor(y[i] / this.cell)) * this.gw + Math.min(this.gw - 1, Math.floor(x[i] / this.cell));
      (buckets[k] || (buckets[k] = [])).push(i);
    }
    this.grid = buckets;
    this.buildBase();
  }

  buildBase() {
    if (!this.layout || !this.pw) return;
    const ctx = this.sharp.getContext('2d');
    this.img = ctx.createImageData(this.pw, this.ph);
    const base = new Uint8ClampedArray(this.pw * this.ph * 4);
    const [wr, wg, wb] = this.palette.well;
    for (let p = 0; p < base.length; p += 4) { base[p] = wr; base[p + 1] = wg; base[p + 2] = wb; base[p + 3] = 255; }
    const { cls, n } = this.layout;
    for (let i = 0; i < n; i++) {
      const c = this.palette.classes[cls[i]];
      const dim = cls[i] === CLASS.CORE ? 0.05 : cls[i] === CLASS.SENSE ? 0.12 : 0.3;
      const p = this.pix[i] * 4;
      base[p] = Math.min(255, base[p] + c[0] * dim);
      base[p + 1] = Math.min(255, base[p + 1] + c[1] * dim);
      base[p + 2] = Math.min(255, base[p + 2] + c[2] * dim);
    }
    this.base = base;
  }

  /**
   * activity: Uint8Array per neuron (addon encoding), chanSpikes: per-channel spike values
   * (sensory neurons do not adapt in the model, so they are lit from their channel instead).
   */
  update(activity, chanSpikes, mode = 'rate') {
    if (!this.layout) return;
    const { n, cls, group } = this.layout;
    const t = this.target;
    this.frame++;
    if (activity && activity.length === n) {
      if (mode === 'v') {
        // potential: reset (0) sits at byte 85, threshold (1) at 255
        for (let i = 0; i < n; i++) { const v = (activity[i] - 110) / 145; t[i] = v <= 0 ? 0 : v; }
      } else {
        // rate: below ~1.3 Hz stays dark, ~30 Hz is full brightness
        for (let i = 0; i < n; i++) {
          const b = activity[i];
          t[i] = b < 4 ? 0 : b >= 96 ? 1 : Math.pow(b / 96, 0.8);
        }
      }
    }
    if (chanSpikes) {
      for (let i = 0; i < n; i++) {
        if (cls[i] !== CLASS.SENSE) continue;
        const g = group[i];
        const rate = g >= 0 ? chanSpikes[g] || 0 : 0;
        const p = Math.min(0.9, rate / 60);
        t[i] = hash01(i, this.frame) < p ? 0.55 + 0.45 * Math.min(1, rate / 40) : 0;
      }
    }
  }

  /** Draws one frame; call from requestAnimationFrame. */
  draw() {
    if (!this.layout || !this.base) return;
    const { n, cls } = this.layout;
    const lvl = this.level, t = this.target;
    const data = this.img.data;
    data.set(this.base);
    const pal = this.palette.classes;
    const w = this.pw;
    const big = this.dpr >= 1.5;
    for (let i = 0; i < n; i++) {
      let v = lvl[i] * 0.86;
      if (t[i] > v) v = t[i];
      lvl[i] = v;
      if (v < 0.06) continue;
      const c = pal[cls[i]];
      // brighten toward white as activity rises
      const white = v * v * 0.55;
      const r = (c[0] + (255 - c[0]) * white) * v;
      const g = (c[1] + (255 - c[1]) * white) * v;
      const b = (c[2] + (255 - c[2]) * white) * v;
      const p = this.pix[i] * 4;
      data[p] += r; data[p + 1] += g; data[p + 2] += b;
      if (big && v > 0.45) {
        const q = p + 4, s = p + w * 4;
        data[q] += r * 0.6; data[q + 1] += g * 0.6; data[q + 2] += b * 0.6;
        data[s] += r * 0.6; data[s + 1] += g * 0.6; data[s + 2] += b * 0.6;
      }
    }
    const sctx = this.sharp.getContext('2d');
    sctx.putImageData(this.img, 0, 0);
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.drawImage(this.sharp, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7;
    ctx.filter = `blur(${Math.round(3 * this.dpr)}px)`;
    ctx.drawImage(this.sharp, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.labels && this.cssW >= 560) this.drawLabels(ctx);
    if (this.hoverIndex >= 0) this.drawHover(ctx);
  }

  drawLabels(ctx) {
    const sx = this.pw / W, sy = this.ph / H;
    const d = this.dpr;
    ctx.save();
    ctx.font = `${Math.round(12 * d)}px "Golos Text", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const [wr, wg, wb] = this.palette.well;
    for (const [text, lx, ly, align] of REGION_LABELS) {
      const tw = ctx.measureText(text).width;
      const x = lx * sx, y = ly * sy;
      const x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
      ctx.fillStyle = `rgba(${wr},${wg},${wb},0.78)`;
      ctx.fillRect(x0 - 4 * d, y - 9 * d, tw + 8 * d, 18 * d);
      ctx.fillStyle = this.palette.label;
      ctx.textAlign = 'left';
      ctx.fillText(text, x0, y);
    }
    ctx.restore();
  }

  drawHover(ctx) {
    const i = this.hoverIndex;
    const sx = this.pw / W, sy = this.ph / H;
    ctx.save();
    ctx.strokeStyle = this.palette.label;
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.beginPath();
    ctx.arc(this.layout.x[i] * sx, this.layout.y[i] * sy, 7 * this.dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  describe(i) {
    const { cls, group, meta } = this.layout;
    const g = group[i];
    let name;
    if (g >= 0) name = CHANNEL[meta.chanNames[g]] || meta.chanNames[g];
    else if (g <= -2) {
      const o = -g - 2;
      name = OUTPUT[meta.outNames[o]] || meta.outNames[o];
    } else name = cls[i] === CLASS.MOD ? 'Клетка Кеньона (грибовидные тела)' : 'Внутренний нейрон';
    return { name, cls: NEURON_CLASS[CLASS_KEYS[cls[i]]] };
  }

  onHover(e) {
    if (!this.layout || !this.grid) return;
    const r = this.canvas.getBoundingClientRect();
    const lx = (e.clientX - r.left) / r.width * W, ly = (e.clientY - r.top) / r.height * H;
    const cx = Math.floor(lx / this.cell), cy = Math.floor(ly / this.cell);
    let best = -1, bd = 36;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy;
      if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) continue;
      const b = this.grid[gy * this.gw + gx];
      if (!b) continue;
      for (const i of b) {
        const d = (this.layout.x[i] - lx) ** 2 + (this.layout.y[i] - ly) ** 2 - this.level[i] * 30;
        if (d < bd) { bd = d; best = i; }
      }
    }
    this.hoverIndex = best;
    if (best < 0) { hideTip(); return; }
    const d = this.describe(best);
    const lv = this.level[best];
    const hz = this.lastActivity ? this.lastActivity[best] * 0.3125 : null;
    const sensory = this.layout.cls[best] === CLASS.SENSE;
    showTip(e.clientX, e.clientY,
      `<b>Нейрон ${best.toLocaleString('ru-RU')}</b><br>${escapeHtml(d.name)}<br><span class="muted">${escapeHtml(d.cls)}</span><br>` +
      (sensory ? `Яркость по частоте своего канала: ${Math.round(lv * 100)}%`
        : hz != null ? `Частота ≈ ${hz.toFixed(1)} Гц` : `Яркость ${Math.round(lv * 100)}%`));
  }
}
