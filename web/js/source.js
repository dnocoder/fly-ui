// Live data from the Fly UI addon running inside Minecraft.

async function getJson(url, timeoutMs = 4000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (r.status === 202) return { pending: true };
    if (!r.ok) {
      let msg = r.status + '';
      try { msg = (await r.json()).error || msg; } catch { /* not json */ }
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export class LiveSource {
  constructor(base) {
    this.base = base.replace(/\/$/, '');
    this.kind = 'live';
    this.listeners = new Set();
    this.es = null;
    this.pollTimer = null;
    this.hello = null;
  }

  /** Throws if no addon answers at this address. */
  async connect() {
    this.hello = await getJson(this.base + '/api/hello', 2500);
    if (this.hello.addon !== 'flyui') throw new Error('not a Fly UI server');
    this.openStream();
    return this.hello;
  }

  onSnapshot(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  emit(snap) { for (const cb of this.listeners) cb(snap); }

  openStream() {
    if (typeof EventSource === 'undefined') { this.startPolling(); return; }
    this.es = new EventSource(this.base + '/api/stream');
    let opened = false;
    this.es.onopen = () => { opened = true; this.stopPolling(); };
    this.es.onmessage = ev => {
      try { this.emit(JSON.parse(ev.data)); } catch { /* ignore a torn message */ }
    };
    this.es.onerror = () => {
      // EventSource retries by itself; if it never opened, fall back to polling.
      if (!opened) { this.es.close(); this.es = null; this.startPolling(); }
      else this.emit({ disconnected: true });
    };
  }

  startPolling() {
    if (this.pollTimer) return;
    const hz = (this.hello && this.hello.sampleHz) || 5;
    this.pollTimer = setInterval(async () => {
      try { this.emit(await getJson(this.base + '/api/state', 3000)); }
      catch { this.emit({ disconnected: true }); }
    }, Math.max(100, 1000 / hz));
  }

  stopPolling() { clearInterval(this.pollTimer); this.pollTimer = null; }

  meta() { return getJson(this.base + '/api/meta', 30000); }

  async activity(uuid, kind = 'rate') {
    const r = await fetch(`${this.base}/api/activity?fly=${encodeURIComponent(uuid)}&kind=${kind}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  }

  async vision(uuid) {
    const v = await getJson(`${this.base}/api/vision?fly=${encodeURIComponent(uuid)}`, 3000);
    return v.pending ? null : v;
  }

  circuit(name) { return getJson(`${this.base}/api/circuit?name=${name}`, 10000); }

  net(uuid, name) { return getJson(`${this.base}/api/net?fly=${encodeURIComponent(uuid)}&name=${name}`, 5000); }

  close() {
    if (this.es) this.es.close();
    this.stopPolling();
    this.listeners.clear();
  }
}

/** Finds the addon: same origin, ?api= override, or the default local port. */
export async function findAddon() {
  const params = new URLSearchParams(location.search);
  const candidates = [];
  if (params.get('api')) candidates.push(params.get('api'));
  if (location.protocol.startsWith('http')) candidates.push(location.origin);
  candidates.push('http://127.0.0.1:8765', 'http://localhost:8765');
  const seen = new Set();
  for (const base of candidates) {
    if (seen.has(base)) continue;
    seen.add(base);
    const src = new LiveSource(base);
    try {
      await src.connect();
      return src;
    } catch {
      src.close();
    }
  }
  return null;
}
