import { WebSocket } from 'ws';
import { PORT } from './config';
import type { Snap } from './snapshot';

export class Bot {
  ws: WebSocket;
  id = 0;
  seq = 0;
  a = 0;
  b = 0;
  hints: any[] = []; // every `hint` message this phone heard (contextual buttons)
  vec = { x: 0, y: 0 };
  btn = 0;
  private waitUntil = 0;
  private lastPress = 0;
  private stable = 0;
  private nextCrate = 0;
  private hadItem = false;
  constructor(
    private slot: number,
    name: string,
    room: string,
    private rows: readonly string[],
  ) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `bot-${room}-${slot}` })));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') {
        this.id = m.player.id;
        this.ws.send(JSON.stringify({ t: 'schoolDone' })); // else the first "A cocinar" offers the Cocina escuela and the shots show it
      } else if (m.t === 'hint') this.hints.push(m);
    });
    this.nextCrate = slot % 2;
  }
  startSending() {
    setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          t: 'input',
          seq: this.seq++,
          x: this.vec.x,
          y: this.vec.y,
          btn: this.btn,
          presses: [this.a, this.b],
          ts: Date.now(),
        }),
      );
    }, 33).unref();
  }
  private floor(x: number, y: number) {
    const c = this.rows[y]?.[x];
    return c === '.' || c === 'S';
  }
  private path(from: [number, number], goals: Set<string>): [number, number][] | null {
    const key = (x: number, y: number) => `${x},${y}`;
    const prev = new Map<string, string | null>([[key(...from), null]]);
    const q: [number, number][] = [from];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i]!;
      if (goals.has(key(x, y))) {
        const out: [number, number][] = [];
        let k: string | null = key(x, y);
        while (k) {
          const [a, b] = k.split(',').map(Number) as [number, number];
          out.unshift([a, b]);
          k = prev.get(k) ?? null;
        }
        return out;
      }
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx,
          ny = y + dy;
        if (this.floor(nx, ny) && !prev.has(key(nx, ny))) {
          prev.set(key(nx, ny), key(x, y));
          q.push([nx, ny]);
        }
      }
    }
    return null;
  }
  decide(snap: Snap) {
    const me = snap.players.find((p) => p.id === this.id);
    if (!me || snap.phase !== 'playing' || snap.countdown > 0) {
      this.vec = { x: 0, y: 0 };
      this.btn = 0;
      return;
    }
    const now = Date.now();
    if (now < this.waitUntil) {
      this.btn = 0;
      this.vec = { x: 0, y: 0 };
      return;
    }
    const st = snap.stations;
    const cutType = (it: string | null) => (it === 'cut0' ? 0 : it === 'cut1' ? 1 : -1);
    let target: (typeof st)[number] | undefined;
    const goalsOf = (t: (typeof st)[number]) => {
      const g = new Set<string>();
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        if (this.floor(t.tx + dx, t.ty + dy)) g.add(`${t.tx + dx},${t.ty + dy}`);
      return g;
    };
    const cell0: [number, number] = [Math.floor(me.x), Math.floor(me.y)];
    const nearest = (list: typeof st) =>
      list
        .map((t) => ({ t, p: this.path(cell0, goalsOf(t)) }))
        .filter((x) => x.p)
        .sort((p, q) => p.p!.length - q.p!.length)[0]?.t;
    const pots = st.filter((s) => s.kind === 'pot');
    const boards = st.filter((s) => s.kind === 'board');
    const counters = st.filter((s) => s.kind === 'counter');
    const sinks = st.filter((s) => s.kind === 'sink');
    const returns = st.filter((s) => s.kind === 'dirty');
    const finite = sinks.length > 0 && returns.length > 0;
    const hasCheese = st.some((s) => s.kind === 'crate' && s.crate === 2);
    let cutHere = false;
    if (me.item && !this.hadItem) this.nextCrate = (this.nextCrate + 1) % (hasCheese ? 3 : 2);
    this.hadItem = !!me.item;
    const cutT = (it: string | null) => (it === 'cut0' ? 0 : it === 'cut1' ? 1 : it === 'cut2' ? 2 : -1);
    if (me.item === 'raw0' || me.item === 'raw1' || me.item === 'raw2') target = nearest(boards.filter((b) => !b.item));
    else if (me.item === 'cut0' || me.item === 'cut1' || me.item === 'cut2') {
      const t = cutT(me.item);
      target =
        nearest(pots.filter((p) => !p.done && p.inputs.length < 3 && !p.inputs.includes(t) && (t < 2 || p.inputs.length >= 1))) ??
        nearest(counters.filter((c) => !c.item && c.tx >= 6 && c.tx <= 8 && c.ty >= 1 && c.ty <= 7));
    } else if (me.item === 'plate') target = nearest(pots.filter((p) => p.done));
    else if (me.item === 'dish' || me.item === 'dishQ') target = nearest(st.filter((s) => s.kind === 'window'));
    else if (me.item === 'dirty') target = nearest(sinks);
    else {
      const crates = st.filter((s) => s.kind === 'crate');
      const canCrate = !!nearest(crates);
      const dirtyAt = returns.find((r) => r.count > 0),
        washing = sinks.find((k) => k.count > 0);
      if (pots.some((p) => p.done)) {
        const pile = st.filter((s) => s.kind === 'plates' && (!finite || s.count > 0));
        target = nearest(pile) ?? nearest(sinks.filter((k) => k.clean > 0));
        if (!target && washing) {
          target = washing;
          cutHere = true;
        }
      } else if (washing && (this.slot % 4 === 3 || !canCrate)) {
        target = washing;
        cutHere = true;
      } else if (dirtyAt && this.slot % 4 === 3) target = dirtyAt;
      else {
        const ready = boards.filter((b) => b.item?.startsWith('cut'));
        const raw = boards.filter((b) => b.item?.startsWith('raw'));
        if (!canCrate) target = nearest(counters.filter((c) => c.item?.startsWith('cut')));
        else if (ready.length) target = nearest(ready);
        else if (raw.length) {
          target = nearest(raw);
          cutHere = !!target;
        } else {
          const have = new Set(pots.filter((p) => !p.done).flatMap((p) => p.inputs));
          const missing = [0, 1, ...(hasCheese ? [2] : [])].filter((k) => !have.has(k));
          const wantType = missing.length ? missing[this.slot % missing.length]! : this.nextCrate;
          target = nearest(crates.filter((s) => s.crate === wantType)) ?? nearest(crates);
        }
      }
    }
    if (!target) {
      this.vec = { x: 0, y: 0 };
      this.btn = 0;
      return;
    }
    const cell = cell0;
    const p = this.path(cell, goalsOf(target));
    if (!p) {
      this.vec = { x: 0, y: 0 };
      return;
    }
    if (p.length > 1 || Math.hypot(me.x - (cell[0] + 0.5), me.y - (cell[1] + 0.5)) > 0.18) {
      const [wx, wy] = p.length > 1 ? p[1]! : cell;
      const tx = p.length > 1 && Math.hypot(me.x - (cell[0] + 0.5), me.y - (cell[1] + 0.5)) > 0.35 && false ? cell[0] + 0.5 : wx + 0.5,
        ty = wy + 0.5;
      const dx = tx - me.x,
        dy = ty - me.y,
        d = Math.hypot(dx, dy) || 1;
      this.vec = { x: (dx / d) * Math.min(1, d * 3), y: (dy / d) * Math.min(1, d * 3) };
      this.btn = 0;
      this.stable = 0;
      return;
    }
    // at the stand tile: face the station, then act
    const fx = target.tx + 0.5 - me.x,
      fy = target.ty + 0.5 - me.y,
      fd = Math.hypot(fx, fy) || 1;
    this.vec = { x: fx / fd, y: fy / fd };
    this.stable++;
    if (this.stable < 3) return;
    if (cutHere && !me.item) {
      this.btn = 2;
      return;
    }
    if (target.kind === 'sink' && me.item !== 'dirty' && target.count > 0 && !me.item) {
      this.btn = 2;
      return;
    }
    this.btn = 0;
    if (now - this.lastPress > 500) {
      this.a++;
      this.lastPress = now;
      this.waitUntil = now + 120;
    }
  }
  close() {
    this.ws.close();
  }
}
