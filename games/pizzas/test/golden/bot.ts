// Deterministic coop "golden" driver: scripted chefs that play the real engine through its public controls (tick), so a full
// round is reproducible from (map, difficulty, n, seed) alone. F2 (teams in the sim) must reproduce these runs exactly.
// Test support only: nothing in the game imports this.
import { fixedMap, isFloor, DIRS } from '../../sim/maps';
import { GameEvents, Emitter } from '../../sim/round/events';
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, targetStation, tick, type Controls, type Game, type Player, type Station } from '../../sim/overcooked';
import type { Difficulty } from '@pichi/core/difficulty';
import type { MechId } from '../../sim/mech/ids';

export interface RuleFlags { mech?: Partial<Record<MechId, boolean>>; burn?: boolean; fire?: boolean; events?: boolean; magnet?: boolean | 'strong' } // the new rules of the sim, all off by default: the three original goldens never set them
export interface Scenario { name: string; mapId: string; difficulty: Difficulty; n: number; seed: number; teams?: readonly { playerIds: readonly number[] }[]; assist?: readonly number[]; flags?: RuleFlags } // teams: declared roster (a single team must play exactly like none)
export const SCENARIOS: readonly Scenario[] = [
  { name: 'coop-n2-map2-normal', mapId: '2', difficulty: 'normal', n: 2, seed: 11 },
  { name: 'coop-n4-map9-hard', mapId: '9', difficulty: 'hard', n: 4, seed: 22 },
  { name: 'coop-n6-map11-easy', mapId: '11', difficulty: 'easy', n: 6, seed: 33 },
];

// Rounds with the new rules switched on (the oven that burns, the fire, the mid-round event), fixtures of their own, re-recorded on purpose with
// tools/record-golden.ts. The three above stay byte for byte what they were: they never set a flag. These were picked by scanning (map, difficulty, n, seed)
// for scripted chefs that leave pizzas in the oven: map 2 on Hard with 4 chefs (seed 15, HAZARD_V2: three events) burns two and the fire jumps to a counter (for these bots a rescue and a fire exclude each other: the rescue lives in burn.test.ts);
// map 11 on Normal with 6 chefs (seed 1) burns one and the fire jumps four times; the 2-chef round (seed 23, also the magnet's) has the rat steal a dish (scared off under the magnet).
const FLAGS: RuleFlags = { burn: true, fire: true, events: true };
export const RULES_SCENARIOS: readonly Scenario[] = [
  { name: 'coop-n2-map2-normal-rules', mapId: '2', difficulty: 'normal', n: 2, seed: 23, flags: FLAGS },
  { name: 'coop-n4-map2-hard-rules', mapId: '2', difficulty: 'hard', n: 4, seed: 15, flags: FLAGS },
  { name: 'coop-n6-map11-normal-rules', mapId: '11', difficulty: 'normal', n: 6, seed: 1, flags: FLAGS },
];

// Rounds with the magnetism on (feel/magnet.ts), their own fixtures; the six above never set it and stay byte for byte. Normal and Hard get the normal magnet, Easy the strong one;
// the first also has the lobby's other rules on (burning oven, fire, the rat event: the gentle rat is part of the magnet's feel rules).
export const MAGNET_SCENARIOS: readonly Scenario[] = [
  { name: 'coop-n2-map2-normal-magnet', mapId: '2', difficulty: 'normal', n: 2, seed: 23, flags: { ...FLAGS, magnet: true } },
  { name: 'coop-n4-map9-hard-magnet', mapId: '9', difficulty: 'hard', n: 4, seed: 22, flags: { magnet: true } },
  { name: 'coop-n6-map11-easy-magnet', mapId: '11', difficulty: 'easy', n: 6, seed: 33, flags: { magnet: 'strong' } },
];

export interface GoldenRun {
  name: string;
  score: number; delivered: number; expired: number; rejected: number; tips: number; bestStreak: number; ticks: number;
  chefs: { id: number; x: number; y: number; item: string | null }[]; // final state, rounded
  events: string[]; // "tick|type|payload"
}

// Recording bus: the same Emitter the game uses, plus a log of every event in order.
export class RecBus extends Emitter<GameEvents> {
  log: string[] = [];
  tick = 0;
  override emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]) {
    this.log.push(`${this.tick}|${type}|${JSON.stringify(payload)}`);
    super.emit(type, payload);
  }
}

type Take = 'a' | 'chop' | 'serve';
interface Step { at: 'crate0' | 'crate1' | 'crate2' | 'crate3' | 'crate4' | 'board' | 'pot' | 'plates' | 'window'; take: Take; done: (g: Game, p: Player, s: Station) => boolean }
const cut = (p: Player) => !!p.item && p.item.startsWith('cut');
// dough -> board -> cut -> oven; tomato -> board -> cut -> oven; plate -> oven when done -> window
const RECIPE: readonly Step[] = [
  { at: 'crate0', take: 'a', done: (_g, p) => p.item === 'raw0' },
  { at: 'board', take: 'a', done: (_g, p) => !p.item },
  { at: 'board', take: 'chop', done: (_g, _p, s) => !!s.item && s.item.startsWith('cut') },
  { at: 'board', take: 'a', done: (_g, p) => cut(p) },
  { at: 'pot', take: 'a', done: (_g, p) => !p.item },
  { at: 'crate1', take: 'a', done: (_g, p) => p.item === 'raw1' },
  { at: 'board', take: 'a', done: (_g, p) => !p.item },
  { at: 'board', take: 'chop', done: (_g, _p, s) => !!s.item && s.item.startsWith('cut') },
  { at: 'board', take: 'a', done: (_g, p) => cut(p) },
  { at: 'pot', take: 'a', done: (_g, p) => !p.item },
  { at: 'plates', take: 'a', done: (_g, p) => p.item === 'plate' },
  { at: 'pot', take: 'serve', done: (_g, p) => p.item === 'dish' || p.item === 'dishQ' },
  { at: 'window', take: 'a', done: (_g, p) => !p.item },
];
const STUCK_MS = 25_000;
const PRESS_EVERY = 12; // ticks between A presses of one chef

export const stationsOf = (g: Game, at: Step['at']) =>
  at.startsWith('crate') ? g.stations.filter((s) => s.kind === 'crate' && s.crate === Number(at[5])) : g.stations.filter((s) => s.kind === (at === 'window' ? 'window' : at));

// BFS over floor tiles from the chef's tile to the nearest tile that touches the station. Returns the next tile to head for, or null when already there.
export function route(g: Game, p: Player, s: Station): { arrived: boolean; next: [number, number] | null } {
  const sx = Math.floor(p.x), sy = Math.floor(p.y);
  const touches = (x: number, y: number) => DIRS.some(([dx, dy]) => x + dx === s.tx && y + dy === s.ty);
  if (touches(sx, sy)) return { arrived: true, next: null };
  const prev = new Map<string, string | null>([[`${sx},${sy}`, null]]);
  const queue: [number, number][] = [[sx, sy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    if (touches(x, y)) {
      let k = `${x},${y}`;
      while (prev.get(k) && prev.get(prev.get(k)!) !== null) k = prev.get(k)!;
      const [nx, ny] = k.split(',').map(Number) as [number, number];
      return { arrived: false, next: [nx, ny] };
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (isFloor(g.grid, nx, ny) && !prev.has(k)) { prev.set(k, `${x},${y}`); queue.push([nx, ny]); }
    }
  }
  return { arrived: false, next: null };
}

export interface Mem { step: number; since: number; lastPress: number; bin: boolean }

export function decide(g: Game, p: Player, rank: number, m: Mem, tickNo: number): Controls {
  const idle: Controls = { x: 0, y: 0, a: 0, b: false };
  const step = RECIPE[m.step]!;
  const bins = g.stations.filter((x) => x.kind === 'trash' || x.kind === 'counter');
  const list = m.bin ? bins : stationsOf(g, step.at);
  const s: Station | undefined = list[rank % Math.max(1, list.length)];
  if (!s) return idle;
  if (m.bin ? !p.item : step.done(g, p, s)) { // step finished: the next one (after emptying the hands: from the top)
    m.step = m.bin ? 0 : (m.step + 1) % RECIPE.length;
    m.bin = false;
    m.since = g.time;
    return idle;
  }
  if (g.time - m.since > STUCK_MS) { // stuck behind another chef or a full station: drop what is in hand and start over
    m.since = g.time;
    if (p.item) m.bin = true; else m.step = 0;
    return idle;
  }
  const { arrived, next } = route(g, p, s);
  if (!arrived) {
    if (!next) return idle;
    const dx = next[0] + 0.5 - p.x, dy = next[1] + 0.5 - p.y, l = Math.hypot(dx, dy) || 1;
    // an occasional dash from the odd chefs while walking empty-handed: exercises dash and bump events
    const dash = rank % 2 === 1 && !p.item && !m.bin && tickNo % 900 === rank * 7;
    return { x: dx / l, y: dy / l, a: 0, b: dash };
  }
  const fx = s.tx + 0.5 - p.x, fy = s.ty + 0.5 - p.y, l = Math.hypot(fx, fy) || 1;
  const face = { x: fx / l, y: fy / l };
  const onIt = targetStation(g, p) === s;
  const take = m.bin ? 'a' : step.take;
  if (take === 'chop') return { ...face, a: 0, b: onIt };
  if (!onIt || tickNo - m.lastPress < PRESS_EVERY || (take === 'serve' && !s.done)) return { ...face, a: 0, b: false };
  m.lastPress = tickNo;
  return { ...face, a: 1, b: false };
}

export function runGolden(sc: Scenario): GoldenRun {
  const map = fixedMap(sc.mapId)!;
  const bus = new RecBus();
  const g = createGame({ mapId: map.id, difficulty: sc.difficulty, n: sc.n, rows: map.rows, spawns: map.spawns, seed: sc.seed, countdownMs: COUNTDOWN_MS, bus, teams: sc.teams, assist: sc.assist, ...sc.flags });
  const ids = Array.from({ length: sc.n }, (_v, i) => i + 1);
  ids.forEach((id, rank) => addPlayer(g, id, rank, rank));
  const mem = new Map(ids.map((id) => [id, { step: 0, since: 0, lastPress: -99, bin: false } as Mem]));
  let t = 0;
  const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS) + 60;
  while (!g.over && t < limit) {
    bus.tick = t;
    const controls = new Map<number, Controls>();
    ids.forEach((id, rank) => controls.set(id, decide(g, g.players.get(id)!, rank, mem.get(id)!, t)));
    tick(g, controls);
    t++;
  }
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    name: sc.name, score: g.score, delivered: g.delivered, expired: g.expired, rejected: g.rejected, tips: g.tips, bestStreak: g.bestStreak, ticks: t,
    chefs: ids.map((id) => { const p = g.players.get(id)!; return { id, x: r6(p.x), y: r6(p.y), item: p.item }; }),
    events: bus.log,
  };
}
