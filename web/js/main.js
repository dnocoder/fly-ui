import { $, $$, el, fmt, pct, parseKv, hexToRgb, cssVar, hideTip } from './util.js';
import { CHANNEL, CHANNEL_GROUPS, OUTPUT, OUTPUT_GROUPS, HUD_KEY, NEURON_CLASS, doingRu } from './i18n.js';
import { findAddon, LiveSource } from './source.js';
import { DemoSource } from './demo.js';
import { layoutBrain, BrainMap } from './brainmap.js';
import { Heatmap } from './heat.js';
import { SmallChart } from './series.js';
import { EyeView, VisualInputs, Radar } from './vision.js';
import { Compass } from './compass.js';
import { CircuitView } from './circuit.js';
import { VarTable } from './vars.js';

const MAX_HUNGER = 20;
const DIM_RU = { 'minecraft:overworld': 'Верхний мир', 'minecraft:the_nether': 'Незер', 'minecraft:the_end': 'Энд' };

const state = {
  src: null,
  gen: 0,
  meta: null,
  metaLoading: false,
  flyId: null,
  snap: null,
  fly: null,
  mode: 'rate',
  hz: 10,
  circuitsLoaded: false,
  lastHudPaint: 0,
};

// ---- colours ---------------------------------------------------------------

function readColors() {
  const v = n => cssVar(n);
  return {
    page: v('--page'), page2: v('--page-2'), ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), line: v('--line'),
    well: v('--well'), wellInk: v('--well-ink'), wellMuted: v('--well-muted'), wellLine: v('--well-line'),
    wellSense: v('--w-sense'), wellAct: v('--w-act'), wellCore: v('--w-core'), wellMod: v('--w-mod'),
    sense: v('--c-sense'), act: v('--c-act'), core: v('--c-core'), mod: v('--c-mod'),
    senseDeep: v('--c-sense-deep'), actDeep: v('--c-act-deep'), alert: v('--alert'),
  };
}
let colors = readColors();

// ---- components --------------------------------------------------------------

const brain = new BrainMap($('#brain'), brainPalette());
const senses = new Heatmap($('#senses'), {
  groups: CHANNEL_GROUPS, names: CHANNEL, hz: 10,
  describe: k => k,
});
const outputs = new Heatmap($('#outputs'), {
  groups: OUTPUT_GROUPS, names: OUTPUT, hz: 10,
  describe: k => {
    const i = state.meta && state.meta.outNames ? state.meta.outNames.indexOf(k) : -1;
    return i >= 0 && state.meta.outLabels ? state.meta.outLabels[i] : '';
  },
});
const eye = new EyeView($('#eye'));
const visin = new VisualInputs($('#visin'));
const radar = new Radar($('#radar'));
const compass = new Compass($('#compass'));
const circuit = new CircuitView($('#circuit'));
const vars = new VarTable($('#vars'), $('#varsearch'));

const loco = f => (f.brain && f.brain.loco) || {};
const learnCharts = [
  new SmallChart($('#learn-charts'), {
    title: 'Сила синапсов памяти', note: 'Грибовидные тела: что избегать и к чему приближаться',
    series: [
      { name: 'избегать', color: '--c-act', get: f => loco(f).memAvoid },
      { name: 'приближаться', color: '--c-sense', get: f => loco(f).memApproach },
    ], digits: 2,
  }),
  new SmallChart($('#learn-charts'), {
    title: 'Дофамин', note: 'Обучающие сигналы: награда (PAM) и наказание (PPL1)',
    series: [
      { name: 'награда', color: '--c-sense', get: f => f.brain && f.brain.pamLP },
      { name: 'наказание', color: '--c-act', get: f => f.brain && f.brain.ppl1LP },
    ], digits: 2,
  }),
  new SmallChart($('#learn-charts'), {
    title: 'Давление сна', series: [{ name: 'давление сна', color: '--c-mod', get: f => f.mind && f.mind.sleepP }], digits: 2,
  }),
  new SmallChart($('#learn-charts'), {
    title: 'Внутренние часы', note: 'Утренние и вечерние клетки-осцилляторы',
    series: [
      { name: 'утро', color: '--c-sense', get: f => f.mind && f.mind.clockM },
      { name: 'вечер', color: '--c-act', get: f => f.mind && f.mind.clockE },
    ], digits: 2,
  }),
];
const bodyCharts = [
  new SmallChart($('#body-charts'), { title: 'Сытость', series: [{ name: 'сытость', color: '--c-core', get: f => f.hunger }], min: 0, max: MAX_HUNGER, digits: 1 }),
  new SmallChart($('#body-charts'), { title: 'Жажда', series: [{ name: 'жажда', color: '--c-sense', get: f => f.thirst }], min: 0, max: 20, digits: 1 }),
  new SmallChart($('#body-charts'), { title: 'Здоровье', series: [{ name: 'здоровье', color: '--c-act', get: f => f.health }], min: 0, digits: 1 }),
  new SmallChart($('#body-charts'), { title: 'Поворот', note: 'Минус — влево, плюс — вправо', series: [{ name: 'поворот', color: '--c-act', get: f => loco(f).turnBias }], digits: 2 }),
  new SmallChart($('#body-charts'), { title: 'Активность мозга', note: 'Средняя активность по всей сети', series: [{ name: 'активность', color: '--c-core', get: f => loco(f).activity }], min: 0, digits: 2 }),
  new SmallChart($('#body-charts'), { title: 'Скорость симуляции', note: '1000 шагов в секунду — реальное время мухи', series: [{ name: 'шагов в секунду', color: '--c-mod', get: f => loco(f).stepsPerSec }], min: 0, digits: 0 }),
];
const charts = [...learnCharts, ...bodyCharts];

function brainPalette() {
  return {
    well: hexToRgb(colors.well),
    classes: [hexToRgb(colors.wellSense), hexToRgb(colors.wellCore), hexToRgb(colors.wellAct), hexToRgb(colors.wellMod)],
    label: colors.wellMuted,
  };
}

function heatColors(hue, deep) {
  return { surface: colors.page2, hue, deep, ink: colors.ink, ink2: colors.ink2, muted: colors.muted, line: colors.line, page: colors.page };
}

function applyColors() {
  colors = readColors();
  brain.setPalette(brainPalette());
  senses.setColors(heatColors(colors.sense, colors.senseDeep));
  outputs.setColors(heatColors(colors.act, colors.actDeep));
  resizeAll();
  renderClassLegend();
}

function resizeAll() {
  brain.resize();
  senses.resize(); outputs.resize();
  eye.resize(colors); radar.resize(colors); compass.resize(colors); circuit.resize(colors);
  for (const c of charts) c.resize(colors);
}

// ---- theme -----------------------------------------------------------------

const themeBtn = $('#theme');
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  themeBtn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
  try { localStorage.setItem('flyui-theme', t); } catch { /* storage unavailable */ }
  applyColors();
}
try { const saved = localStorage.getItem('flyui-theme'); if (saved) document.documentElement.dataset.theme = saved; } catch { /* ignore */ }
themeBtn.textContent = currentTheme() === 'dark' ? 'Светлая тема' : 'Тёмная тема';
themeBtn.addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) applyColors(); });

// ---- controls ----------------------------------------------------------------

$$('[data-mode]').forEach(b => b.addEventListener('click', () => {
  state.mode = b.dataset.mode;
  $$('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
}));
$('#labels').addEventListener('change', e => { brain.labels = e.target.checked; });
$$('[data-circuit]').forEach(b => b.addEventListener('click', () => {
  circuit.show(b.dataset.circuit);
  $$('[data-circuit]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  circuitNote();
}));
$('#fly').addEventListener('change', e => { state.flyId = e.target.value; });
$('#connect').addEventListener('submit', async e => {
  e.preventDefault();
  const base = $('#api').value.trim();
  setStatus('wait', 'Подключение…');
  const src = new LiveSource(base);
  try { await src.connect(); useSource(src); }
  catch { src.close(); setStatus(state.src && state.src.kind === 'demo' ? 'demo' : 'lost', 'Аддон по этому адресу не ответил'); }
});

function circuitNote() {
  $('#circuit-note').textContent = circuit.name === 'escape'
    ? 'Клетки зрительных долей, которые реагируют на надвигающийся предмет (LC4, LPLC1, LPLC2), сходятся на нисходящих нейронах. Один из них — гигантское волокно, оно запускает прыжковую мышцу. Чем светлее точка, тем выше потенциал. Кольцо вокруг точки означает спайк в этот момент.'
    : 'Нисходящие команды поворота и ходьбы приходят в нервную цепочку, где сотни вставочных нейронов управляют мышцами лапок. Справа мотонейроны, сгруппированные по мышцам; названия мышц взяты из коннектома.';
}
circuitNote();

// ---- connection --------------------------------------------------------------

function setStatus(kind, text) {
  const s = $('#status');
  s.dataset.state = kind;
  s.textContent = text;
}

function useSource(src) {
  if (state.src) state.src.close();
  state.src = src;
  state.gen++;
  state.meta = null;
  state.metaLoading = false;
  state.circuitsLoaded = false;
  brain.layout = null;
  src.onSnapshot(onSnapshot);
  if (src.kind === 'demo') {
    setStatus('demo', 'Демо-режим');
    $('#notice').hidden = false;
    $('#notice-text').textContent = 'Игра с аддоном Fly UI не найдена, поэтому сейчас показаны синтетические данные. Запустите Minecraft с модами Connectome Fly и Fly UI и откройте мир: страница подключится сама.';
    retryLive(state.gen);
  } else {
    setStatus('live', 'В игре');
    $('#notice').hidden = true;
  }
  activityLoop(state.gen);
  visionLoop(state.gen);
  loadMeta(state.gen);
}

async function retryLive(gen) {
  while (gen === state.gen) {
    await sleep(8000);
    if (gen !== state.gen) return;
    const src = await findAddon();
    if (src && gen === state.gen) { useSource(src); return; }
  }
}

async function loadMeta(gen) {
  if (state.metaLoading) return;
  state.metaLoading = true;
  while (gen === state.gen && !state.meta) {
    try {
      const m = await state.src.meta();
      if (gen !== state.gen) return;
      state.meta = m;
      brain.setLayout(layoutBrain(m));
      senses.setKeys(m.chanNames);
      outputs.setKeys(m.outNames);
      compass.setMeta(m);
      renderClassLegend();
      resizeAll();
    } catch {
      await sleep(4000);
    }
  }
  state.metaLoading = false;
}

async function loadCircuits(gen, uuid) {
  if (state.circuitsLoaded) return;
  state.circuitsLoaded = true;
  for (const name of ['escape', 'steering']) {
    try {
      const [c, order] = await Promise.all([state.src.circuit(name), state.src.net(uuid, name)]);
      if (gen !== state.gen) return;
      circuit.setGraph(name, c, order);
    } catch {
      state.circuitsLoaded = false;
    }
  }
  circuit.resize(colors);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function activityLoop(gen) {
  while (gen === state.gen) {
    const fly = state.fly;
    if (fly && state.meta && brain.layout && fly.brain && !document.hidden) {
      try {
        const a = await state.src.activity(fly.uuid, state.mode);
        if (gen !== state.gen) return;
        if (a && a.length === brain.layout.n) {
          brain.lastActivity = state.mode === 'rate' ? a : null;
          brain.update(a, loco(state.fly).chanSpikes, state.mode);
          if (state.mode === 'rate') compass.update(state.fly, a);
        }
      } catch { /* next round */ }
    }
    await sleep(160);
  }
}

async function visionLoop(gen) {
  while (gen === state.gen) {
    const fly = state.fly;
    if (fly && !document.hidden) {
      try {
        const v = await state.src.vision(fly.uuid);
        if (gen !== state.gen) return;
        if (v) eye.set(v);
      } catch { /* next round */ }
    }
    await sleep(220);
  }
}

// ---- snapshots ---------------------------------------------------------------

function onSnapshot(snap) {
  if (snap.disconnected) { setStatus('lost', 'Нет связи с игрой'); return; }
  state.snap = snap;
  if (state.src.kind === 'live') setStatus('live', `В игре, ${snap.sampleHz || 10} снимков в секунду`);
  const flies = snap.flies || [];
  updateFlyPicker(flies);
  const fly = flies.find(f => f.uuid === state.flyId) || flies[0] || null;
  state.fly = fly;
  state.flyId = fly ? fly.uuid : null;
  if (!fly) { emptyState(snap); return; }
  $('#brain-empty').hidden = !brainBlocked(fly, snap);
  if (state.src.kind === 'live' || state.src.kind === 'demo') loadCircuits(state.gen, fly.uuid);

  narrate(fly);
  vitals(fly);
  where(fly);
  const l = loco(fly);
  if (l.chanSpikes) senses.push(l.chanSpikes);
  if (l.outRate) outputs.push(l.outRate, l.outBase);
  for (const c of charts) c.push(fly, snap);
  visin.update(fly, state.meta);
  radar.set(fly);
  if (state.mode !== 'rate' || !state.meta) compass.update(fly, null);
  else { compass.fly = fly; compass.dirty = true; }
  $('#compass-text').textContent = compass.summary();
  circuit.update({ escape: fly.escape, steering: fly.steering });
  vars.push(fly);
  if (performance.now() - state.lastHudPaint > 500) { paintHud(fly); state.lastHudPaint = performance.now(); }
}

function brainBlocked(fly, snap) {
  const node = $('#brain-empty');
  let msg = null;
  if (!fly.brain) {
    msg = fly.male
      ? 'У самца в моде нет полного мозга: он управляется маленькой цепью ухаживания.'
      : /brain=waiting/.test(fly.hud || '')
        ? `Мозг этой мухи ждёт очереди. Одновременно работает не больше ${snap.maxBrains || '?'} мозгов, сейчас занято ${snap.brainsRunning ?? '?'}. Число можно поменять командой /flylab brains.`
        : 'Мозг этой мухи пока не запущен.';
  } else if (!state.meta) {
    msg = 'Загружаем схему мозга…';
  }
  if (msg) node.textContent = msg;
  return msg != null;
}

function emptyState(snap) {
  const n = $('#brain-empty');
  n.hidden = false;
  if (!snap.world) {
    $('#narration').textContent = 'Мир не открыт.';
    n.textContent = 'Войдите в мир, и здесь загорится мозг мухи.';
  } else if (!snap.mod) {
    $('#narration').textContent = 'Мод Connectome Fly не установлен.';
    n.textContent = 'Fly UI работает, но без мода Connectome Fly показывать нечего. Поставьте его в ту же сборку.';
  } else {
    $('#narration').textContent = 'В мире пока нет мух.';
    n.textContent = 'Призовите муху командой /flylab spawn или яйцом призыва из творческого инвентаря.';
  }
  $('#vitals').replaceChildren();
  $('#speech').hidden = true;
}

function updateFlyPicker(flies) {
  const pick = $('.flypick');
  pick.hidden = flies.length < 2;
  const sel = $('#fly');
  const want = flies.map(f => f.uuid).join(',');
  if (sel.dataset.ids === want) return;
  sel.dataset.ids = want;
  sel.replaceChildren(...flies.map((f, i) => el('option', { value: f.uuid },
    `${f.male ? 'Самец' : 'Самка'} ${i + 1}${f.baby ? ', малыш' : ''}${f.brain ? '' : ', без мозга'}`)));
  if (state.flyId) sel.value = state.flyId;
}

function narrate(fly) {
  const hud = Object.fromEntries(parseKv(fly.hud).filter(([k]) => k));
  let action = fly.fleeing ? 'Спасается бегством' : doingRu(hud.doing);
  if (!action) action = fly.sleeping ? 'Спит' : fly.flying ? 'Летит' : 'Стоит';
  if (fly.flying && !/Летит|Зависла|Садится|Готовится/.test(action)) action += ' в полёте';
  const extras = [];
  if (fly.hunger != null && fly.hunger < 7) extras.push('голодна');
  if (fly.thirst != null && fly.thirst > 14) extras.push('хочет пить');
  if (fly.drinking) extras.push('пьёт');
  const text = extras.length ? `${action}, ${extras.join(' и ')}.` : `${action}.`;
  const n = $('#narration');
  if (n.textContent !== text) n.textContent = text;
  const sp = $('#speech');
  if (fly.speech) { sp.hidden = false; sp.textContent = `«${fly.speech}»`; } else sp.hidden = true;
}

function vitals(fly) {
  const l = loco(fly);
  const items = [
    ['Сытость', fly.hunger != null ? pct(fly.hunger / MAX_HUNGER) : '—', fly.hunger != null && fly.hunger < 7],
    ['Жажда', fly.thirst != null ? pct(fly.thirst / 20) : '—', fly.thirst != null && fly.thirst > 14],
    ['Здоровье', fly.health != null ? `${fmt(fly.health, 1)} из ${fmt(fly.maxHealth, 0)}` : '—', fly.health != null && fly.maxHealth && fly.health < fly.maxHealth * 0.4],
    ['Мозг', l.stepsPerSec ? `${fmt(l.stepsPerSec, 0)} шагов/с` : fly.brain ? 'запускается' : 'нет', false],
    ['Пол', fly.male ? 'самец' : 'самка', false],
  ];
  if (fly.baby) items.push(['Возраст', 'малыш', false]);
  $('#vitals').replaceChildren(...items.map(([k, v, alert]) => el('div', {}, el('dt', {}, k), el('dd', { class: alert ? 'alert' : null }, v))));
}

function where(fly) {
  const dim = DIM_RU[fly.dim] || fly.dim;
  $('#where').textContent = `${dim}, ${fmt(fly.x, 0)}, ${fmt(fly.y, 0)}, ${fmt(fly.z, 0)}`;
}

function paintHud(fly) {
  const rows = [...parseKv(fly.hud), ...parseKv(fly.hudExtra)].filter(([k]) => k);
  $('#hud').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, HUD_KEY[k] || k), el('dd', {}, v)]));
  $('#debug').textContent = [fly.state, fly.debug].filter(Boolean).join('\n\n') || '—';
}

function renderClassLegend() {
  const counts = brain.layout ? brain.layout.counts : null;
  const items = [['sense', '--w-sense', 0], ['core', '--w-core', 1], ['act', '--w-act', 2], ['mod', '--w-mod', 3]];
  $('#classes').replaceChildren(...items.map(([k, c, i]) => el('li', {},
    el('i', { class: 'swatch', style: `background:var(${c})` }),
    NEURON_CLASS[k],
    counts ? el('span', { class: 'count' }, counts[i].toLocaleString('ru-RU')) : null)));
}

// ---- render loop ---------------------------------------------------------------

let lastBrain = 0, lastVars = 0;
function frame(t) {
  if (t - lastBrain > 33) { brain.draw(); lastBrain = t; }
  senses.draw(); outputs.draw();
  for (const c of charts) c.draw();
  eye.draw(); radar.draw(); compass.draw(); circuit.draw();
  if (t - lastVars > 250) { vars.render(colors); lastVars = t; }
  requestAnimationFrame(frame);
}

let resizeTimer = 0;
new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resizeAll, 120); }).observe($('main'));
window.addEventListener('scroll', hideTip, { passive: true });

// ---- start ---------------------------------------------------------------------

(async function start() {
  applyColors();
  renderClassLegend();
  requestAnimationFrame(frame);
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) { useSource(new DemoSource()); return; }
  const live = await findAddon();
  useSource(live || new DemoSource());
})();
