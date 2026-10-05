// Synthetic data with the same shape as the live addon, so the page works without the game.
// Nothing here comes from the real connectome: sizes are rounded, indices are random.

import { hash01 } from './util.js';

const N = 158262;

// Channel and output names in the mod's order; sizes are approximate.
const CHANS = [
  ['heating', 6], ['cooling', 40], ['humid', 20], ['dry', 35], ['gust_sugar', 540], ['olf_food', 900],
  ['olf_fruit', 750], ['olf_co2', 90], ['tactile', 7200], ['auditory', 1200], ['aversive', 230],
  ['pheromone', 690], ['visual', 7550], ['wind', 790], ['pen_left', 21], ['pen_right', 21],
  ['sleep_pressure', 21], ['light_clock', 6], ['reward', 280], ['punishment', 13], ['nutrient', 16],
  ['small_object_left', 160], ['small_object_right', 210], ['song', 470], ['aggression_pc1', 4],
  ['motion_prog_left', 570], ['motion_reg_left', 560], ['motion_prog_right', 1600], ['motion_reg_right', 1620],
  ['clock_morning', 10], ['clock_evening', 12], ['taste_bitter_leg', 74], ['taste_sugar_leg', 300],
  ['taste_water', 25], ['taste_sugar_labellum', 90], ['taste_bitter_labellum', 48], ['song_pc1', 6],
  ['landmark_left', 177], ['landmark_right', 262],
];
const OUTS = [
  ['dn_turn_left', 2], ['dn_giant_fiber', 2], ['dn_aggression', 4], ['dn_courtship', 2], ['dn_backward', 4],
  ['mn_neck', 49], ['dn_egg_laying', 2], ['mn_respiratory', 18], ['mn_leg_hind', 126], ['mn_leg_hind_right', 63],
  ['mn_leg_front', 139], ['mn_leg_front_right', 70], ['mn_leg_front_left', 69], ['mn_leg_hind_left', 63],
  ['mn_wing_power', 24], ['mn_ovulation', 6], ['mn_proboscis', 35], ['mn_leg_middle', 124],
  ['mn_leg_middle_left', 62], ['mn_leg_middle_right', 62], ['mn_pharynx', 22], ['mn_haltere', 13],
  ['mn_wing_steer', 24], ['mn_antenna', 10], ['mn_jump', 2], ['dn_turn_right', 2], ['pfl3_left', 14],
  ['pfl3_right', 11], ['epg', 45], ['clock', 47], ['dfb_sleep', 153], ['mbon_avoid', 20], ['mbon_approach', 26],
  ['pam', 281], ['ppl1', 13], ['ipc', 16], ['mn_wing_steer_left', 12], ['mn_wing_steer_right', 12],
  ['mn_haltere_left', 11], ['mn_haltere_right', 12], ['mn_neck_left', 27], ['mn_neck_right', 22],
  ['lc_small_left', 157], ['lc_small_right', 208], ['pc1_receptive', 6], ['pc1_aggr', 4], ['vpoen', 6],
  ['hs_left', 3], ['hs_right', 3], ['vs_left', 14], ['vs_right', 18], ['clock_morning', 10],
  ['clock_evening', 12], ['dn_p13', 2], ['lc_bar_left', 177], ['lc_bar_right', 262],
];
const CI = Object.fromEntries(CHANS.map(([k], i) => [k, i]));
const OI = Object.fromEntries(OUTS.map(([k], i) => [k, i]));

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function buildMeta() {
  // Hand out neuron indices with a deterministic shuffle.
  const order = new Uint32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(hash01(i, 11) * (i + 1));
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  let p = 0;
  const take = n => Array.from(order.subarray(p, (p += n)));
  const sensory = new Uint8Array(N);
  const neuronChan = new Uint8Array(N).fill(255);
  const chanIdx = CHANS.map(([, n], c) => {
    const ids = take(n);
    for (const i of ids) { sensory[i] = 1; neuronChan[i] = c; }
    return ids;
  });
  const dnclass = new Uint8Array(N);
  const outIdx = OUTS.map(([k, n]) => {
    const ids = take(n);
    if (k.startsWith('dn_')) for (const i of ids) dnclass[i] = 1;
    return ids;
  });
  const isKC = new Uint8Array(N);
  for (const i of take(5100)) isKC[i] = 1;
  const epgIdx = outIdx[OI.epg];
  const epgAngle = epgIdx.map((_, k) => -Math.PI + (k + 0.5) * (2 * Math.PI / epgIdx.length));
  return {
    demo: true,
    n: N, nEdges: 3126254, nPlastic: 4085,
    chanNames: CHANS.map(c => c[0]), chanIdx,
    outNames: OUTS.map(o => o[0]),
    outLabels: OUTS.map(o => o[0]),
    outIdx, epgIdx, epgAngle,
    sensory: toB64(sensory), dnclass: toB64(dnclass), isKC: toB64(isKC), neuronChan: toB64(neuronChan),
  };
}

function buildCircuit() {
  const nodes = [];
  const add = (type, role, count) => {
    for (let k = 0; k < count; k++) nodes.push({ id: `demo-${nodes.length}`, cell_type: type, role, side: k % 2 ? 'right' : 'left' });
  };
  add('LPLC2', 'sensory', 181); add('LPLC1', 'sensory', 124); add('LC4', 'sensory', 114);
  add('DNp01', 'descending', 2); add('DNp02', 'descending', 2); add('DNp11', 'descending', 2);
  add('TTMn', 'motor', 2); add('PSI', 'motor', 2);
  const edges = [];
  const dn = nodes.filter(n => n.role === 'descending');
  const mot = nodes.filter(n => n.role === 'motor');
  nodes.forEach((n, i) => {
    if (n.role !== 'sensory') return;
    const t = dn[Math.floor(hash01(i, 3) * dn.length)];
    edges.push({ pre: n.id, post: t.id, weight: 1 + Math.floor(hash01(i, 4) * 6) });
  });
  dn.forEach((d, i) => mot.forEach((m, j) => { if ((i + j) % 2 === 0) edges.push({ pre: d.id, post: m.id, weight: 20 }); }));
  return { nodes, edges };
}

// Behaviour script: what the demo fly is doing over time.
const SCRIPT = [
  ['walking', 9], ['standing', 4], ['grooming', 7], ['walking', 6], ['feeding', 10],
  ['standing', 4], ['threat', 4], ['flying', 6], ['landing', 2], ['walking', 7], ['asleep', 12],
];
const DOING = { walking: 'walking', standing: 'standing', grooming: 'grooming', feeding: 'feeding', threat: 'standing', flying: 'hovering', landing: 'landing', asleep: 'asleep' };

export class DemoSource {
  constructor() {
    this.kind = 'demo';
    this.listeners = new Set();
    this._meta = null;
    this.t0 = performance.now();
    this.state = { hunger: 13, thirst: 6, health: 10, yaw: 30, x: 12.4, y: 64, z: -3.1, memAvoid: 0.18, memApproach: 0.31, mb: 0.12 };
    this.timer = setInterval(() => this.tick(), 100);
    this.seq = 0;
    this.circuitData = buildCircuit();
  }

  async connect() { return { addon: 'flyui', demo: true }; }

  onSnapshot(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  phase(t) {
    const total = SCRIPT.reduce((s, x) => s + x[1], 0);
    let u = t % total;
    for (const [name, d] of SCRIPT) {
      if (u < d) return { name, u, d, f: u / d };
      u -= d;
    }
    return { name: 'standing', u: 0, d: 1, f: 0 };
  }

  tick() {
    const t = (performance.now() - this.t0) / 1000;
    const ph = this.phase(t);
    const s = this.state;
    const noise = k => 0.5 + 0.5 * Math.sin(t * (1.3 + k * 0.37) + k * 1.7);
    const chan = new Float32Array(CHANS.length);
    const out = new Float32Array(OUTS.length);
    const base = new Float32Array(OUTS.length).fill(2);
    for (let i = 0; i < chan.length; i++) chan[i] = Math.max(0, (noise(i) - 0.75) * 6);
    for (let i = 0; i < out.length; i++) out[i] = 1 + noise(i + 40) * 2;

    const set = (k, v) => { chan[CI[k]] += v; };
    const put = (k, v) => { out[OI[k]] += v; };
    const turn = Math.sin(t * 0.7) * 0.6;
    let walk = 0, loom = 0, flying = false, asleep = false;
    set('light_clock', 4); set('clock_morning', 3 + 3 * Math.sin(t / 30)); set('clock_evening', 3 - 3 * Math.sin(t / 30));
    set('nutrient', s.hunger * 0.6);
    put('epg', 30 + 10 * noise(3)); put('clock', 8);
    switch (ph.name) {
      case 'walking':
        walk = 2.2;
        set('motion_prog_left', 18 + 6 * noise(1)); set('motion_prog_right', 18 + 6 * noise(2));
        set('tactile', 8); set('landmark_left', 6 * noise(5)); set('landmark_right', 9 * noise(6));
        set(turn > 0 ? 'pen_right' : 'pen_left', Math.abs(turn) * 20);
        for (const k of ['mn_leg_front_left', 'mn_leg_front_right', 'mn_leg_middle_left', 'mn_leg_middle_right', 'mn_leg_hind_left', 'mn_leg_hind_right', 'mn_leg_front', 'mn_leg_middle', 'mn_leg_hind'])
          put(k, 25 + 15 * Math.sin(t * 9 + k.length));
        put(turn > 0 ? 'dn_turn_right' : 'dn_turn_left', 20 * Math.abs(turn));
        put('pfl3_left', 8 + 6 * Math.max(0, -turn)); put('pfl3_right', 8 + 6 * Math.max(0, turn));
        s.yaw += turn * 3;
        s.x += -Math.sin(s.yaw * Math.PI / 180) * 0.05; s.z += Math.cos(s.yaw * Math.PI / 180) * 0.05;
        break;
      case 'grooming':
        set('tactile', 30); put('mn_leg_front_left', 50); put('mn_leg_front_right', 50); put('mn_leg_front', 45); put('mn_neck', 20);
        break;
      case 'feeding':
        set('olf_food', 35); set('olf_fruit', 25); set('gust_sugar', 40); set('taste_sugar_labellum', 60); set('taste_sugar_leg', 30);
        put('mn_proboscis', 70 + 20 * Math.sin(t * 6)); put('mn_pharynx', 50 + 25 * Math.sin(t * 6 + 1)); put('pam', 25); set('reward', 25);
        put('ipc', 10 * ph.f);
        s.hunger = Math.min(20, s.hunger + 0.03); s.mb = Math.min(0.6, s.mb + 0.002); s.memApproach = Math.min(0.8, s.memApproach + 0.001);
        break;
      case 'threat':
        loom = Math.min(1, ph.f * 1.3);
        set('visual', 50 * loom); set('small_object_left', 20 * loom); set('motion_reg_left', 25 * loom);
        put('lc_small_left', 30 * loom); put('lc_bar_left', 15 * loom);
        if (ph.f > 0.8) { put('dn_giant_fiber', 120); put('mn_jump', 140); put('ppl1', 20); set('punishment', 20); s.memAvoid = Math.min(0.8, s.memAvoid + 0.01); }
        break;
      case 'flying':
      case 'landing':
        flying = ph.name === 'flying';
        set('wind', 45); set('motion_prog_left', 40); set('motion_prog_right', 40); set('visual', 15);
        put('mn_wing_power', flying ? 120 : 40); put('mn_haltere_left', 60); put('mn_haltere_right', 60); put('mn_haltere', 55);
        put('mn_wing_steer_left', 30 + 20 * Math.max(0, turn)); put('mn_wing_steer_right', 30 + 20 * Math.max(0, -turn));
        put('hs_left', 20); put('hs_right', 20); put('vs_left', 12); put('vs_right', 12);
        s.y = 64 + (flying ? 3 * Math.min(1, ph.f * 3) : 3 * (1 - ph.f));
        s.yaw += turn * 4;
        break;
      case 'asleep':
        asleep = true;
        for (let i = 0; i < chan.length; i++) chan[i] *= 0.3;
        set('sleep_pressure', 30); put('dfb_sleep', 40 + 10 * noise(9)); put('mn_respiratory', 6);
        break;
      default:
        set('visual', 6); put('mn_antenna', 10 * noise(8));
    }
    put('mbon_avoid', 10 * s.memAvoid); put('mbon_approach', 10 * s.memApproach);
    s.hunger = Math.max(2, s.hunger - 0.004);
    s.thirst = Math.min(20, s.thirst + 0.002);
    const activity = asleep ? 0.6 : 1.2 + walk * 0.4 + loom * 2 + (flying ? 1 : 0);

    const doing = DOING[ph.name];
    const chansHud = CHANS.map(([k], i) => [k, chan[i]]).filter(x => x[1] > 15).map(x => x[0]).slice(0, 5).join(', ') || 'quiet';
    const outsHud = OUTS.map(([k], i) => [k, out[i]]).filter(x => x[1] > 25).map(x => x[0]).slice(0, 5).join(', ') || 'resting';
    const gf = ph.name === 'threat' && ph.f > 0.8;
    const hud = `body=model;doing=${doing};box=every sense live;brain=${(activity * 10).toFixed(1)};dn=L ${(0.2 + Math.max(0, -turn)).toFixed(2)}  R ${(0.2 + Math.max(0, turn)).toFixed(2)};turn=${turn >= 0 ? '+' : ''}${turn.toFixed(2)};walk=${walk.toFixed(1)};chans=${chansHud};esc=LC4/LPLC ${Math.round(loom * 140)} · DN ${gf ? 6 : 0} · TTMn ${gf ? 'FIRED' : 'silent'};outs=${outsHud};hp=${s.health.toFixed(1)};hunger=${s.hunger.toFixed(1)};thirst=${s.thirst.toFixed(1)};`;
    const compass = ((s.yaw % 360) + 540) % 360 - 180;
    const hudExtra = `cmp=bump ${compass.toFixed(0)} deg · amp 0.62 · home 3.4 m;mem=valence ${(s.memApproach - s.memAvoid).toFixed(2)} · synapses avoid ${s.memAvoid.toFixed(2)} / approach ${s.memApproach.toFixed(2)};slp=pressure ${asleep ? '0.81' : '0.22'} · R5 0.10 vs l-LNv 0.04${asleep ? ' · ASLEEP' : ''};air=under cover · ${flying ? 40 : 5}% of the last minutes in the air · wind from the south;sat=IPCs ${ph.name === 'feeding' ? 'x2 (insulin)' : 'at rest'};see=${loom > 0.1 ? 'a zombie looming on the left' : 'nothing small moving'};taste=${ph.name === 'feeding' ? 'sugar on the feet' : 'nothing'};opto=HS L/R 0.12 / 0.10;social=alone;`;

    const snap = {
      v: 1, demo: true, addon: '0.1.0', seq: ++this.seq, ms: Date.now(), world: true, sampleHz: 10, mod: true,
      modVersion: 'demo', brainsRunning: 1, maxBrains: 2, timeOfDay: (t * 20) % 24000,
      flies: [{
        uuid: 'demo-fly', id: 1, dim: 'minecraft:overworld',
        x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: 0, vx: 0, vy: 0, vz: 0,
        alive: true, onGround: !flying, health: s.health, maxHealth: 10, sleeping: asleep,
        hunger: s.hunger, thirst: s.thirst, growth: 108000, baby: false, male: false, flying,
        flapping: flying, grooming: ph.name === 'grooming', perched: false, standing: ph.name === 'standing',
        mating: false, mated: false, dragged: false, neuroLegs: Math.round(walk * 40), neuroFlight: flying ? 60 : 0,
        speech: ph.name === 'threat' && ph.f > 0.6 ? 'Что-то большое быстро приближается слева' : '',
        bodyMode: 0, hud, hudExtra, state: `demo state: ${ph.name}`,
        fleeing: ph.name === 'threat' && ph.f > 0.8, drinking: false,
        mind: {
          sleepP: asleep ? 0.81 : 0.22, sleepScore: asleep ? 0.9 : 0.1, asleep, mbValence: s.memApproach - s.memAvoid,
          memAvoid: s.memAvoid, memApproach: s.memApproach, ipcAct: ph.name === 'feeding' ? 0.7 : 0.1,
          lcLeft: 20 * loom, lcRight: 0, optoZ: walk * 0.1, optoTurn: turn * 0.2, receptivity: 0.3,
          clockM: 0.5 + 0.5 * Math.sin(t / 30), clockE: 0.5 - 0.5 * Math.sin(t / 30),
          tasteSugar: ph.name === 'feeding' ? 1 : 0, tasteBitter: 0, tasteWater: 0,
          smellFruit: ph.name === 'feeding' ? 0.8 : 0.1, cmpHeading: compass, cmpAmp: 0.62,
          label: ph.name, brainLabel: doing, seeLabel: loom > 0.1 ? 'zombie' : 'nothing',
        },
        entity: { flying, mated: false, lastSensorySpikes: Math.round(loom * 140), lastDnSpikes: gf ? 6 : 0, prevThreatTheta: loom * 0.4,
          lastSensed: { threatFound: loom > 0, threatDist: 12 - 9 * loom, threatLoom: loom, threatLoomDrive: loom * 0.8, threatThetaDrive: loom * 0.4, threatSide: -1, wallLoom: 0.05, threatName: loom > 0 ? 'zombie' : null } },
        brain: {
          ready: true, running: true, compassHeading: compass * Math.PI / 180, compassStrength: 0.6,
          pamLP: ph.name === 'feeding' ? 0.8 : 0.4, ppl1LP: gf ? 0.4 : 0.05,
          memory: [s.memAvoid, s.memApproach], dopamine: [ph.name === 'feeding' ? 0.8 : 0.4, gf ? 0.4 : 0.05],
          loco: {
            turnBias: turn, walkDrive: walk, activity, chanSpikes: Array.from(chan), stepsPerSec: 990 + 20 * noise(1),
            dnLeft: 0.2 + Math.max(0, -turn), dnRight: 0.2 + Math.max(0, turn), outRate: Array.from(out), outBase: Array.from(base),
            compassAngle: compass * Math.PI / 180, compassAmp: 0.62, epgRate: 30, memAvoid: s.memAvoid, memApproach: s.memApproach,
          },
        },
        intent: { jump: gf, fleeing: gf, yawDeltaDeg: 0, stepBlocks: walk * 0.05, dnSpikes: gf ? 6 : 0, sensorySpikes: Math.round(loom * 140) },
        escape: this.escapeState(loom, gf, t),
        props: [
          { kind: 'FOOD', dx: 3.5, dy: 0, dz: 2, effect: 'cake' },
          { kind: 'HOME', dx: -2, dy: 0, dz: -3 },
          { kind: 'LIGHT', dx: 6, dy: 3, dz: -5 },
          ...(loom > 0 ? [{ kind: 'PREDATOR', dx: -8 * (1 - loom) - 2, dy: 0, dz: 6 * (1 - loom) + 1, entity: 'zombie' }] : []),
        ],
      }],
    };
    this.last = { snap, chan, out, loom, activity, ph };
    for (const cb of this.listeners) cb(snap);
  }

  escapeState(loom, gf, t) {
    const n = this.circuitData.nodes.length;
    const v = new Array(n);
    const spiked = [];
    for (let i = 0; i < n; i++) {
      const role = this.circuitData.nodes[i].role;
      const left = this.circuitData.nodes[i].side === 'left';
      let drive = role === 'sensory' ? loom * (left ? 1 : 0.35) : role === 'descending' ? (gf ? 1 : loom * 0.5) : gf ? 1 : 0;
      const r = hash01(i, Math.floor(t * 10));
      v[i] = Math.round(Math.min(0.99, drive * 0.8 + r * 0.25) * 1000) / 1000;
      if (r < drive * 0.35) spiked.push(i);
    }
    return { v, spiked };
  }

  async meta() {
    if (!this._meta) this._meta = buildMeta();
    return this._meta;
  }

  /** Per-neuron activity bytes in the same encoding as the addon (~0.31 Hz per unit). */
  async activity() {
    const m = await this.meta();
    if (!this.last) return null;
    if (!this._sens) {
      this._sens = Uint8Array.from(atob(m.sensory), c => c.charCodeAt(0));
    }
    const { chan, out, activity } = this.last;
    const a = new Uint8Array(N);
    const t = performance.now() / 1000;
    const k = Math.floor(t * 8);
    for (let i = 0; i < N; i++) {
      if (this._sens[i]) continue;
      const r = hash01(i, k);
      const tone = hash01(i, 5);
      a[i] = r < 0.012 * activity * tone ? 30 + Math.floor(r * 3000) % 140 : Math.floor(tone * tone * tone * 6 * activity);
    }
    m.outIdx.forEach((ids, o) => {
      const v = Math.min(255, out[o] * 2);
      for (const i of ids) a[i] = Math.max(a[i], v * (0.6 + 0.4 * hash01(i, k)));
    });
    m.chanIdx.forEach((ids, c) => {
      if (chan[c] < 1) return;
      const v = Math.min(255, chan[c] * 3);
      for (let j = 0; j < ids.length; j += 3) a[ids[j]] = v;
    });
    return a;
  }

  async vision() {
    if (!this.last) return null;
    const W = 64, H = 28;
    const yaw = this.last.snap.flies[0].yaw;
    const loom = this.last.loom;
    const rgb = new Uint8Array(W * H * 3), depth = new Uint8Array(W * H), kind = new Uint8Array(W * H);
    const trees = [[-120, 9], [-40, 14], [25, 6], [80, 18], [150, 11]];
    for (let y = 0; y < H; y++) {
      const el = 75 - 135 * (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const az = -165 + 330 * (x + 0.5) / W;
        const world = az + yaw;
        let col = null, d = 255, kd = 0;
        if (el < -4) {
          const dist = Math.min(32, 1.6 / Math.tan(-el * Math.PI / 180));
          const g = 0.7 + 0.3 * hash01(Math.floor(world / 4) * 97 + Math.floor(dist), 2);
          col = [Math.round(95 * g), Math.round(150 * g), Math.round(64 * g)];
          d = Math.round(dist / 32 * 254); kd = 1;
        }
        for (const [taz, tdist] of trees) {
          const rel = ((world - taz + 540) % 360) - 180;
          const half = Math.atan2(0.9, tdist) * 180 / Math.PI;
          const top = Math.atan2(5, tdist) * 180 / Math.PI;
          if (Math.abs(rel) < half * 2.2 && el > top * 0.35 && el < top * 1.15) { col = [62, 118, 40]; d = Math.round(tdist / 32 * 254); kd = 1; }
          else if (Math.abs(rel) < half * 0.6 && el > -4 && el <= top * 0.35) { col = [102, 76, 46]; d = Math.round(tdist / 32 * 254); kd = 1; }
        }
        if (loom > 0) {
          const zaz = -70, zdist = 12 - 10 * loom;
          const half = Math.atan2(0.4, zdist) * 180 / Math.PI;
          const top = Math.atan2(1.0, zdist) * 180 / Math.PI;
          if (Math.abs(az - zaz) < half * 2 && el < top && el > -top) { col = [255, 64, 64]; d = Math.round(zdist / 32 * 254); kd = 3; }
        }
        if (!col) {
          const tt = Math.max(0, Math.min(1, (el + 10) / 85));
          col = [Math.round(196 - 86 * tt), Math.round(220 - 64 * tt), Math.round(255 - 10 * tt)];
        } else if (kd === 1) {
          const f = Math.pow(d / 254, 1.6) * 0.6;
          col = col.map((c, i) => Math.round(c * (1 - f) + [196, 220, 255][i] * f));
        }
        const idx = y * W + x;
        rgb[idx * 3] = col[0]; rgb[idx * 3 + 1] = col[1]; rgb[idx * 3 + 2] = col[2];
        depth[idx] = d; kind[idx] = kd;
      }
    }
    const entities = loom > 0 ? [{ name: 'zombie', kind: 3, az: -70, el: 0, dist: 12 - 10 * loom, size: 2 * Math.atan2(0.5, 12 - 10 * loom) * 180 / Math.PI, visible: true, threat: 'a zombie' }] : [];
    return { uuid: 'demo-fly', w: W, h: H, az0: -165, az1: 165, el0: -60, el1: 75, range: 32, day: 1, rgb, depth, kind, entities };
  }

  async circuit() { return this.circuitData; }

  async net() {
    const nodes = this.circuitData.nodes;
    return { ids: nodes.map(n => n.id), cellType: nodes.map(n => n.cell_type), role: nodes.map(n => n.role), side: nodes.map(n => n.side) };
  }

  close() { clearInterval(this.timer); this.listeners.clear(); }
}
