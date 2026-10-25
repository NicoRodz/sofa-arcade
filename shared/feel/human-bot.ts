// A "human with a phone" bot for measuring how reliably a chef's interaction lands (council: the pizza controls "got hard to aim").
// It plays through the public controls only (tick), so the SAME file measures any commit of the sim: the sim is passed in as a `Sim` adapter and the
// states it reads (positions, facing, items, stations) are the ones every version has. Test and tooling support: nothing in the game imports this.
//
// What makes it imperfect (the numbers are in HUMAN below, one table, and documented in docs/feel/diagnostico.md):
//  - the stick is noisy (correlated angle noise, magnitude 0.7-1) and every output reaches the sim 60-150 ms late (a delay line)
//  - it lets go of the stick before or after the target: it stops when it is within a random radius of the spot (a part of the drift is anticipated)
//  - it faces the station within +-40 degrees of the true direction, holds the stick that way for a flick (or keeps pushing into it), then presses
//  - it presses again after 350 ms of nothing (up to 3 presses): "first press" is the strict score, "hit" the forgiving one
import { mulberry32, type Rng } from '../rng';

export interface Ctl { x: number; y: number; a: number; b: boolean }
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Sim {
  createGame(o: any): any;
  addPlayer(g: any, id: number, slot: number, spawn?: number): any;
  tick(g: any, c: Map<number, Ctl>): void | Promise<void>; // a promise when the controls travel over a real relay (server/test/magnet.ws.test.ts)
  isFloor(grid: any, x: number, y: number): boolean;
  targetStation?(g: any, p: any): any; // optional: lets a record say which station the sim would have chosen when the first press landed
  maps: readonly { id: string; rows: readonly string[]; spawns?: readonly [number, number][] }[];
}
export type Action = 'take' | 'chop' | 'place' | 'oven' | 'deliver' | 'drop' | 'pickup';
export const ACTIONS: readonly Action[] = ['take', 'chop', 'place', 'oven', 'deliver', 'drop', 'pickup'];
const KIND: Record<Action, string> = { take: 'crate', chop: 'board', place: 'pot', oven: 'pot', deliver: 'window', drop: 'counter', pickup: 'counter' };
export const stationsFor = (g: any, a: Action) => g.stations.map((s: any, i: number) => ({ s, i })).filter(({ s }: any) => s.kind === KIND[a]).map(({ i }: any) => i as number);

export const HUMAN = {
  noiseDeg: 14, noiseTauS: 0.3, magMin: 0.7, magMax: 1, aimOffset: 0.12, // stick noise; where inside the tile it aims
  stopMin: 0.05, stopMax: 0.5, anticipate: [0.5, 1] as const, // tiles: stop radius; share of the latency drift it compensates
  aimErrDeg: 40, aimHoldMs: [100, 260] as const, pressAfterMs: [60, 180] as const, holdPushProb: 0.5,
  latMs: [60, 150] as const, retryMs: 350, maxPresses: 3, giveUpMs: 12_000,
};
const between = (r: Rng, [a, b]: readonly [number, number]) => a + (b - a) * r();
const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const rot = (x: number, y: number, deg: number): [number, number] => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [x * c - y * s, x * s + y * c]; };

export interface Attempt { seed: number; mapIdx: number; map: string; action: Action; station: number; hit: boolean; first: boolean; wrong: boolean; ms: number; presses: number; dashes: number; fromPressMs: number; dist0: number; gap: number; angle: number; pick: number; px: number; py: number; fx: number; fy: number } // gap: tiles from the chef's centre to the station's edge when the first press lands; angle: degrees between the facing and the station's centre
export interface Spec { action: Action; station: number; start?: [number, number] }
interface Probe { ok(g: any, p: any, st: any): boolean; setup(g: any, p: any, st: any): void }
const hold = (item: string | null) => (_g: any, p: any) => { p.item = item; };
const PROBES: Record<Action, Probe> = {
  take: { setup: hold(null), ok: (_g, p, st) => p.item === `raw${st.crate}` },
  chop: { setup: (_g, p, st) => { p.item = null; st.item = 'raw0'; }, ok: (g, p, st) => !!p.cutting && g.stations[p.chopAt] === st },
  place: { setup: (_g, p, st) => { p.item = 'cut0'; st.inputs = []; }, ok: (_g, p, st) => !p.item && st.inputs.length > 0 },
  oven: { setup: (_g, p, st) => { p.item = 'plate'; Object.assign(st, { inputs: [0, 1], done: true, progress: 1 }); }, ok: (_g, p) => p.item === 'dish' },
  deliver: { setup: (g, p) => { p.item = 'dish'; if (!g.orders.some((o: any) => o.recipe === 'marinara')) g.orders.push({ id: 99, expiresAt: g.time + 60_000, warned: false, recipe: 'marinara' }); }, ok: (g, p) => !p.item && g.delivered > 0 }, // an order that this dish serves is always waiting (before R16 a dish nobody asked for was simply not taken)
  drop: { setup: (_g, p, st) => { p.item = 'raw1'; st.item = null; }, ok: (_g, p, st) => !p.item && st.item === 'raw1' },
  pickup: { setup: (_g, p, st) => { p.item = null; st.item = 'cut1'; }, ok: (_g, p) => p.item === 'cut1' },
};

// BFS distances over floor tiles from the tiles that touch the station.
function fieldTo(sim: Sim, g: any, s: any): Map<string, number> {
  const d = new Map<string, number>(), q: [number, number][] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const x = s.tx + dx, y = s.ty + dy; if (sim.isFloor(g.grid, x, y)) { d.set(`${x},${y}`, 0); q.push([x, y]); } }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const nx = x + dx, ny = y + dy, k = `${nx},${ny}`; if (sim.isFloor(g.grid, nx, ny) && !d.has(k)) { d.set(k, d.get(`${x},${y}`)! + 1); q.push([nx, ny]); } }
  }
  return d;
}

class Human {
  phase: 'walk' | 'aim' | 'wait' | 'done' = 'walk';
  noise = 0; mag: number; lat: number; stopR: number; comp: number; off: [number, number];
  aimUntil = 0; pressAt = 0; pressTick = -1; presses = 0; keepPush: boolean; aimDeg = 0; lastPress = -1e9; bHoldUntil = 0;
  queue: Ctl[] = []; px = NaN; py = NaN; // the speed it SEES comes from how far the chef moved (older sims have no velocity field)
  first: boolean | null = null; pressT0 = 0; hitAt = -1; startDist = 0; gap = NaN; angle = NaN; pick = -2; pose: [number, number, number, number] = [0, 0, 0, 0];
  constructor(private r: Rng, public st: any, public field: Map<string, number>, public action: Action) {
    this.mag = between(r, [HUMAN.magMin, HUMAN.magMax]);
    this.lat = Math.round(between(r, HUMAN.latMs) / (1000 / 60));
    this.stopR = between(r, [HUMAN.stopMin, HUMAN.stopMax]);
    this.comp = between(r, HUMAN.anticipate);
    this.off = [gauss(r) * HUMAN.aimOffset, gauss(r) * HUMAN.aimOffset];
    this.keepPush = r() < HUMAN.holdPushProb;
  }
  private aim(p: any, now: number) {
    const [ex, ey] = [this.st.tx + 0.5 - p.x, this.st.ty + 0.5 - p.y];
    this.aimDeg = (this.r() * 2 - 1) * HUMAN.aimErrDeg;
    this.aimUntil = now + between(this.r, HUMAN.aimHoldMs);
    this.pressAt = now + between(this.r, HUMAN.pressAfterMs);
    this.aimVec = rot(ex, ey, this.aimDeg);
  }
  aimVec: [number, number] = [0, 0];
  // what the human decides to do this tick (before the latency)
  decide(g: any, p: any, now: number, tickNo: number): Ctl {
    const out: Ctl = { x: 0, y: 0, a: 0, b: false };
    if (this.phase === 'done') return out;
    const tx = Math.floor(p.x), ty = Math.floor(p.y), here = this.field.get(`${tx},${ty}`);
    if (this.phase === 'walk') {
      let gx: number, gy: number;
      if (here === 0) { gx = tx + 0.5 + this.off[0]; gy = ty + 0.5 + this.off[1]; }
      else {
        let best = [tx, ty] as [number, number], bd = here ?? 1e9;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const d = this.field.get(`${tx + dx},${ty + dy}`); if (d !== undefined && d < bd) { bd = d; best = [tx + dx, ty + dy]; } }
        gx = best[0] + 0.5; gy = best[1] + 0.5;
      }
      const dx = gx - p.x, dy = gy - p.y, d = Math.hypot(dx, dy) || 1, speed = Number.isNaN(this.px) ? 0 : Math.hypot(p.x - this.px, p.y - this.py) * 60;
      this.px = p.x; this.py = p.y;
      if (here === 0 && d < this.stopR + speed * (this.lat / 60) * this.comp) { this.phase = 'aim'; this.aim(p, now); }
      else {
        const rho = Math.exp(-1 / 60 / HUMAN.noiseTauS);
        this.noise = this.noise * rho + HUMAN.noiseDeg * Math.sqrt(1 - rho * rho) * gauss(this.r);
        const [x, y] = rot(dx / d, dy / d, this.noise);
        out.x = x * this.mag; out.y = y * this.mag;
        return out;
      }
    }
    if (this.phase === 'aim') {
      if (now < this.aimUntil || this.keepPush) { const l = Math.hypot(...this.aimVec) || 1; out.x = (this.aimVec[0] / l) * this.mag; out.y = (this.aimVec[1] / l) * this.mag; }
      if (now >= this.pressAt) {
        this.phase = 'wait'; this.presses++; this.lastPress = now; this.pressTick = tickNo;
        if (this.first === null) { this.pressT0 = now; this.first = false; }
        if (this.action === 'chop') this.bHoldUntil = now + 600; else out.a = 1;
      }
      return out;
    }
    // wait: keep what the stick was doing (push) and see whether it landed; after retryMs press again
    if (this.keepPush) { const l = Math.hypot(...this.aimVec) || 1; out.x = (this.aimVec[0] / l) * this.mag; out.y = (this.aimVec[1] / l) * this.mag; }
    if (this.action === 'chop' && now < this.bHoldUntil) out.b = true;
    if (now - this.lastPress >= HUMAN.retryMs && !(this.action === 'chop' && now < this.bHoldUntil)) {
      if (this.presses >= HUMAN.maxPresses) this.phase = 'done'; else { this.phase = 'aim'; this.aim(p, now); }
    }
    return out;
  }
}

/** Runs one game with one or two chefs, each attempting its own interaction. Returns one record per chef. */
export async function runGame(sim: Sim, mapIdx: number, specs: readonly Spec[], seed: number, gameOpts: Record<string, unknown> = {}): Promise<Attempt[]> {
  const map = sim.maps[mapIdx]!, r = mulberry32(seed * 7919 + mapIdx);
  const g = sim.createGame({ mapId: map.id, rows: map.rows, spawns: map.spawns, n: Math.max(2, specs.length), seed, countdownMs: 0, ...gameOpts });
  const floor: [number, number][] = [];
  g.grid.forEach((row: any[], y: number) => row.forEach((_t, x) => { if (sim.isFloor(g.grid, x, y)) floor.push([x, y]); }));
  const humans: Human[] = [], ids: number[] = [], used = new Set<string>(), item0: (string | null)[] = [];
  specs.forEach((sp, k) => {
    const id = k + 1;
    sim.addPlayer(g, id, k, k);
    const p = g.players.get(id), st = g.stations[sp.station], field = fieldTo(sim, g, st);
    const reach = floor.filter(([x, y]) => (field.get(`${x},${y}`) ?? -1) >= 3 && !used.has(`${x},${y}`));
    const [sx, sy] = sp.start ?? (reach.length ? reach[Math.floor(r() * reach.length)]! : floor[Math.floor(r() * floor.length)]!);
    used.add(`${sx},${sy}`);
    Object.assign(p, { x: sx + 0.5 + (r() - 0.5) * 0.28, y: sy + 0.5 + (r() - 0.5) * 0.28 }); // within +-0.14 of the tile centre: the body (radius 0.35) never starts inside a wall, where the sim cannot move it
    const [fx, fy] = rot(1, 0, r() * 360); p.fx = fx; p.fy = fy;
    PROBES[sp.action].setup(g, p, st);
    item0.push(p.item);
    const h = new Human(r, st, field, sp.action);
    h.startDist = Math.hypot(p.x - (st.tx + 0.5), p.y - (st.ty + 0.5));
    h.queue = Array.from({ length: h.lat }, () => ({ x: 0, y: 0, a: 0, b: false }));
    humans.push(h); ids.push(id);
  });
  const dashSeen = ids.map(() => 0), wasDash = ids.map(() => false), frame = 1000 / 60;
  for (let t = 0; t < HUMAN.giveUpMs / frame && humans.some((h) => h.phase !== 'done' && h.hitAt < 0); t++) {
    const now = t * frame, c = new Map<number, Ctl>();
    ids.forEach((id, k) => {
      const h = humans[k]!;
      h.queue.push(h.hitAt >= 0 ? { x: 0, y: 0, a: 0, b: false } : h.decide(g, g.players.get(id), now, t));
      c.set(id, h.queue.shift()!);
    });
    await sim.tick(g, c);
    ids.forEach((id, k) => {
      const h = humans[k]!, p = g.players.get(id), dashing = (p.dashMs ?? 0) > 0;
      if (dashing && !wasDash[k]) dashSeen[k]!++;
      wasDash[k] = dashing;
      if (h.presses === 1 && t === h.pressTick + h.lat && Number.isNaN(h.gap)) { // where the chef really is when the first press reaches the sim
        const st = g.stations[specs[k]!.station], nx = Math.max(st.tx, Math.min(p.x, st.tx + 1)), ny = Math.max(st.ty, Math.min(p.y, st.ty + 1));
        h.gap = Math.hypot(p.x - nx, p.y - ny);
        h.pose = [p.x, p.y, p.fx, p.fy];
        if (sim.targetStation) h.pick = g.stations.indexOf(sim.targetStation(g, p));
        const ex = st.tx + 0.5 - p.x, ey = st.ty + 0.5 - p.y;
        h.angle = Math.abs((Math.atan2(p.fx * ey - p.fy * ex, p.fx * ex + p.fy * ey) * 180) / Math.PI);
      }
      if (h.hitAt < 0 && h.presses > 0 && PROBES[specs[k]!.action].ok(g, p, g.stations[specs[k]!.station])) h.hitAt = now;
    });
  }
  return ids.map((id, k) => {
    const h = humans[k]!, p = g.players.get(id), hit = h.hitAt >= 0;
    const wrong = !hit && h.presses > 0 && (p.item !== item0[k] || (!!p.cutting && g.stations[p.chopAt] !== g.stations[specs[k]!.station]));
    const first = hit && h.hitAt - h.pressT0 <= h.lat * frame + 300; // a hit that the first press (plus its buffer) can explain: the retry comes later
    return { seed, mapIdx, map: map.id, action: specs[k]!.action, station: specs[k]!.station, hit, first, wrong, ms: hit ? h.hitAt : HUMAN.giveUpMs, presses: h.presses, dashes: dashSeen[k]!, fromPressMs: hit ? h.hitAt - h.pressT0 : NaN, dist0: h.startDist, gap: h.gap, angle: h.angle, pick: h.pick, px: h.pose[0], py: h.pose[1], fx: h.pose[2], fy: h.pose[3] };
  });
}
