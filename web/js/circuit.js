// Small spiking circuits with real cell identities (escape and steering), drawn
// left to right: inputs -> descending neurons -> motor neurons.

import { fitCanvas, showTip, hideTip, escapeHtml, fmt } from './util.js';

const ROLE_RU = {
  sensory: 'зрительный нейрон-вход',
  descending: 'нисходящий нейрон',
  motor: 'мотонейрон',
  vnc_intrinsic: 'вставочный нейрон нервной цепочки',
};

const LAYOUTS = {
  escape: { sensory: [0.02, 0.5], descending: [0.6, 0.62], motor: [0.8, 0.82] },
  steering: { descending: [0.02, 0.04], vnc_intrinsic: [0.16, 0.5], motor: [0.58, 0.96] },
};

const NAMES = {
  DNp01: 'Гигантское волокно',
  TTMn: 'Прыжковая мышца',
  PSI: 'Мышца крыла (PSI)',
};

export class CircuitView {
  constructor(canvas) {
    this.canvas = canvas;
    this.name = 'escape';
    this.graphs = {};
    canvas.addEventListener('mousemove', e => this.onHover(e));
    canvas.addEventListener('mouseleave', () => { this.hover = null; hideTip(); this.dirty = true; });
  }

  /** circuit: {nodes, edges} from the mod; order: {ids,...} = index order of the live v[] array. */
  setGraph(name, circuit, order) {
    const byId = new Map(circuit.nodes.map((n, k) => [n.id, { ...n, k }]));
    const nodes = (order && order.ids ? order.ids : circuit.nodes.map(n => n.id)).map((id, idx) => {
      const n = byId.get(id) || { id, cell_type: order.cellType[idx], role: order.role[idx], side: order.side[idx] };
      return { id, type: n.cell_type, role: n.role, side: n.side, idx };
    });
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const edges = [];
    for (const e of circuit.edges) {
      const a = index.get(e.pre), b = index.get(e.post);
      if (a != null && b != null) edges.push([a, b, e.weight || e.syn_count || 1]);
    }
    this.graphs[name] = { nodes, edges, layoutFor: null };
    this.layout(name);
    this.dirty = true;
  }

  layout(name) {
    const g = this.graphs[name];
    if (!g) return;
    const cols = LAYOUTS[name] || {};
    const roles = [...new Set(g.nodes.map(n => n.role))];
    roles.forEach((role, ri) => {
      const span = cols[role] || [0.1 + ri * 0.25, 0.3 + ri * 0.25];
      for (const side of ['left', 'right']) {
        const list = g.nodes.filter(n => n.role === role && n.side === side);
        const typeCount = new Map();
        list.forEach(n => typeCount.set(n.type, (typeCount.get(n.type) || 0) + 1));
        list.sort((a, b) => (typeCount.get(b.type) - typeCount.get(a.type)) || a.type.localeCompare(b.type) || a.idx - b.idx);
        const y0 = side === 'left' ? 0.1 : 0.56, y1 = side === 'left' ? 0.44 : 0.9;
        const width = span[1] - span[0], height = y1 - y0;
        const aspect = (width * 1.9) / height;
        const cols2 = Math.max(1, Math.round(Math.sqrt(list.length * aspect)));
        const rows = Math.max(1, Math.ceil(list.length / cols2));
        list.forEach((n, k) => {
          const c = Math.floor(k / rows), r = k % rows;
          n.fx = span[0] + (cols2 === 1 ? width / 2 : c / (cols2 - 1) * width);
          n.fy = y0 + (rows === 1 ? height / 2 : r / (rows - 1) * height);
        });
      }
    });
    // band labels: first node of each sizeable type
    const seen = new Map();
    g.labels = [];
    for (const n of g.nodes) {
      const key = n.role + n.side + n.type;
      if (seen.has(key)) continue;
      seen.set(key, true);
      const count = g.nodes.filter(m => m.type === n.type && m.side === n.side && m.role === n.role).length;
      if (n.role !== 'sensory' || count >= 40) g.labels.push({ n, count });
    }
  }

  show(name) { this.name = name; this.dirty = true; }

  update(state) {
    // state: { escape:{v,spiked}, steering:{v,spiked} }
    this.state = state;
    this.dirty = true;
  }

  resize(colors) {
    this.colors = colors;
    const w = this.canvas.parentElement.clientWidth;
    const h = Math.max(300, Math.round(w * 0.34));
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
    const g = this.graphs[this.name];
    if (!g) {
      ctx.fillStyle = colors.wellMuted;
      ctx.font = '13px "Golos Text", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Цепь появится, когда в мире есть муха с работающим мозгом', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }
    const st = this.state && this.state[this.name];
    const v = st && st.v;
    const spiked = new Set(st && st.spiked ? st.spiked : []);
    const X = n => 14 + n.fx * (w - 28), Y = n => n.fy * h;
    // edges
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.wellLine;
    ctx.globalAlpha = this.name === 'steering' ? 0.12 : 0.22;
    ctx.beginPath();
    for (const [a, b] of g.edges) { const na = g.nodes[a], nb = g.nodes[b]; ctx.moveTo(X(na), Y(na)); ctx.lineTo(X(nb), Y(nb)); }
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = colors.wellInk;
    ctx.beginPath();
    for (const [a, b] of g.edges) if (spiked.has(a)) { const na = g.nodes[a], nb = g.nodes[b]; ctx.moveTo(X(na), Y(na)); ctx.lineTo(X(nb), Y(nb)); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // nodes
    const big = n => n.role === 'descending' || (n.role === 'motor' && this.name === 'escape');
    g.nodes.forEach((n, i) => {
      const val = v ? Math.max(0, Math.min(1, v[i])) : 0;
      const col = n.role === 'sensory' ? colors.wellSense : n.role === 'vnc_intrinsic' ? colors.wellCore : colors.wellAct;
      const r = big(n) ? 7 : this.name === 'steering' ? 2.4 : 2.8;
      ctx.globalAlpha = 0.25 + 0.75 * val;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(X(n), Y(n), r, 0, Math.PI * 2); ctx.fill();
      if (spiked.has(i)) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.wellInk; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(X(n), Y(n), r + 3, 0, Math.PI * 2); ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
    // labels
    ctx.font = '11.5px "Golos Text", system-ui, sans-serif';
    ctx.fillStyle = colors.wellInk;
    for (const { n, count } of g.labels) {
      const label = `${NAMES[n.type] ? NAMES[n.type] + ' ' : ''}${n.type}${count > 2 ? ` (${count})` : ''}`;
      if (n.role === 'sensory' || n.role === 'vnc_intrinsic') continue;
      ctx.fillText(label, X(n) + 11, Y(n) + 4);
    }
    ctx.fillStyle = colors.wellMuted;
    ctx.fillText('левая сторона', 14, 18);
    ctx.fillText('правая сторона', 14, h * 0.53);
    if (this.hover != null) {
      const n = g.nodes[this.hover];
      ctx.strokeStyle = colors.wellInk; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(n), Y(n), 10, 0, Math.PI * 2); ctx.stroke();
    }
  }

  onHover(e) {
    const g = this.graphs[this.name];
    if (!g || !this.w) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 100;
    g.nodes.forEach((n, i) => {
      const d = (14 + n.fx * (this.w - 28) - x) ** 2 + (n.fy * this.h - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    this.hover = best;
    this.dirty = true;
    if (best == null) { hideTip(); return; }
    const n = g.nodes[best];
    const st = this.state && this.state[this.name];
    const v = st && st.v ? st.v[best] : null;
    const conns = g.edges.filter(([a, b]) => a === best || b === best).length;
    showTip(e.clientX, e.clientY,
      `<b>${escapeHtml(NAMES[n.type] ? `${NAMES[n.type]} (${n.type})` : n.type)}</b>` +
      `<br>${escapeHtml(ROLE_RU[n.role] || n.role)}, ${n.side === 'left' ? 'левый' : 'правый'}` +
      `<br>Мембранный потенциал: ${v == null ? '—' : fmt(v)}` +
      `<br>Связей в цепи: ${conns}` +
      `<br><span class="muted">ID в коннектоме ${escapeHtml(n.id)}</span>`);
  }
}
