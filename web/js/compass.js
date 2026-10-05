// Head-direction compass: the ring of EPG cells (at their real angles in the
// ellipsoid body) with the activity bump, and the fly's true heading in the world.

import { fitCanvas, fmt } from './util.js';

const CARDINALS = [['С', 0, -1], ['В', 1, 0], ['Ю', 0, 1], ['З', -1, 0]];

export class Compass {
  constructor(canvas) {
    this.canvas = canvas;
    this.epg = null;
  }

  setMeta(meta) {
    this.epg = (meta.epgIdx || []).map((i, k) => ({ i, a: meta.epgAngle[k] }));
  }

  resize(colors) {
    this.colors = colors;
    const w = this.canvas.parentElement.clientWidth;
    const s = Math.min(w, 280);
    const { ctx } = fitCanvas(this.canvas, w, s);
    this.ctx = ctx; this.w = w; this.h = s;
    this.dirty = true;
  }

  update(fly, activity) {
    this.fly = fly;
    this.activity = activity;
    this.dirty = true;
  }

  draw() {
    if (!this.dirty || !this.ctx || !this.fly) return;
    this.dirty = false;
    const { ctx, w, h, colors } = this;
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 18;
    ctx.fillStyle = colors.well;
    ctx.fillRect(0, 0, w, h);
    const fly = this.fly;
    const loco = fly.brain && fly.brain.loco;

    // world heading ring: forward is up
    const yaw = (fly.yaw || 0) * Math.PI / 180;
    const fx = -Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = -Math.sin(yaw);
    ctx.strokeStyle = colors.wellLine; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '600 12px "Golos Text", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [name, dx, dz] of CARDINALS) {
      const fwd = dx * fx + dz * fz, side = dx * rx + dz * rz;
      const x = cx + side * (R + 10), y = cy - fwd * (R + 10);
      ctx.fillStyle = name === 'С' ? colors.wellInk : colors.wellMuted;
      ctx.fillText(name, x, y);
    }
    ctx.fillStyle = colors.wellInk;
    ctx.beginPath(); ctx.moveTo(cx, cy - R + 2); ctx.lineTo(cx - 5, cy - R + 12); ctx.lineTo(cx + 5, cy - R + 12); ctx.closePath(); ctx.fill();

    // EPG ring
    const r2 = R * 0.62;
    if (this.epg) {
      for (const { i, a } of this.epg) {
        const v = this.activity ? Math.min(1, Math.sqrt(this.activity[i] / 96)) : 0.3;
        const x = cx + Math.sin(a) * r2, y = cy - Math.cos(a) * r2;
        ctx.fillStyle = colors.wellMod;
        ctx.globalAlpha = 0.25 + 0.75 * v;
        ctx.beginPath(); ctx.arc(x, y, 3 + 3 * v, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // bump vector
    if (loco && loco.compassAngle != null && !Number.isNaN(loco.compassAngle)) {
      const a = loco.compassAngle, amp = Math.min(1, loco.compassAmp || 0);
      const x = cx + Math.sin(a) * r2 * amp, y = cy - Math.cos(a) * r2 * amp;
      ctx.strokeStyle = colors.wellMod; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = colors.wellMod;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = colors.wellMuted;
    ctx.font = '11px "Golos Text", system-ui, sans-serif';
    ctx.fillText('клетки EPG', cx, cy + r2 + 14);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  /** Short text summary for the caption. */
  summary() {
    const fly = this.fly;
    if (!fly) return '';
    const loco = fly.brain && fly.brain.loco;
    const deg = loco && loco.compassAngle != null ? ((loco.compassAngle * 180 / Math.PI) + 360) % 360 : null;
    const yaw = (((fly.yaw || 0) % 360) + 360) % 360;
    const dirs = ['юг', 'юго-запад', 'запад', 'северо-запад', 'север', 'северо-восток', 'восток', 'юго-восток'];
    const world = dirs[Math.round(yaw / 45) % 8];
    const home = /home ([\d.]+) m/.exec(fly.hudExtra || '');
    return [
      `Смотрит на ${world}.`,
      deg != null ? `Пик активности компаса: ${fmt(deg, 0)}°, сила ${fmt(loco.compassAmp)}.` : '',
      home ? `До дома ${home[1].replace('.', ',')} м по счёту шагов.` : '',
    ].filter(Boolean).join(' ');
  }
}
