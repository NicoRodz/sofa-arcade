// Test support (nothing in the game imports this): a scripted chef that does the four steps of the school through the real controls, and a loop that runs a session with
// any number of them. The browser screen and the ws tests use the same createSchool; this is only the hands.
import { DIRS, isFloor } from '../maps';
import { type GameEvents, Emitter } from '../round/events';
import { TICK_MS, type Controls, type Game, type Player, type Station } from '../round/state';
import { targetStation } from '../round/targeting';
import type { ClientMsg } from '@pichi/core';
import { createSchool, type School, type SchoolMember } from './school';
import { SCHOOL_TOTAL } from './steps';

const IDLE: Controls = { x: 0, y: 0, a: 0, b: false };
const PRESS_EVERY = 12; // ticks between two A presses of one chef
export interface BotMem {
  lastPress: number;
  stuck: number;
}

// Next tile to head for (BFS over floor to a tile that touches the station); arrived when the chef already stands on one.
function route(g: Game, p: Player, s: Station): { arrived: boolean; next: [number, number] | null } {
  const sx = Math.floor(p.x),
    sy = Math.floor(p.y);
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
      const nx = x + dx,
        ny = y + dy,
        k = `${nx},${ny}`;
      if (isFloor(g.grid, nx, ny) && !prev.has(k)) {
        prev.set(k, `${x},${y}`);
        queue.push([nx, ny]);
      }
    }
  }
  return { arrived: false, next: null };
}
const nearest = (p: Player, list: Station[]) =>
  list.sort((a, b) => Math.hypot(a.tx + 0.5 - p.x, a.ty + 0.5 - p.y) - Math.hypot(b.tx + 0.5 - p.x, b.ty + 0.5 - p.y))[0];

/** What the chef should walk to and do at `step`: the station, and whether it holds B (chop) or taps A. null: wait (done, or waiting for the school to hand something back). */
function goal(g: Game, p: Player, step: number): { s: Station; how: 'a' | 'chop' } | null {
  const of = (kind: Station['kind'], crate?: number) =>
    g.stations.filter((s) => s.kind === kind && (crate === undefined || s.crate === crate));
  if (step === 0) {
    const s = nearest(p, of('crate', 0));
    return s ? { s, how: 'a' } : null;
  }
  if (step === 1) {
    if (p.item === 'raw1') {
      const s = nearest(
        p,
        of('board').filter((b) => !b.item),
      );
      return s ? { s, how: 'a' } : null;
    }
    const mine = nearest(
      p,
      of('board').filter((b) => b.item === 'raw1'),
    );
    if (mine && !p.item) return { s: mine, how: 'chop' };
    if (p.item) return null; // holding something that does not belong: the school takes it
    const s = nearest(p, of('crate', 1));
    return s ? { s, how: 'a' } : null;
  }
  if (step === 2) {
    if (p.item !== 'cut1') return null;
    const s = nearest(
      p,
      of('pot').filter((o) => !o.inputs.length),
    );
    return s ? { s, how: 'a' } : null;
  }
  if (step === 3) {
    if (p.item !== 'dish') return null;
    const s = nearest(p, of('window'));
    return s ? { s, how: 'a' } : null;
  }
  return null;
}

export function botControls(g: Game, p: Player, step: number, m: BotMem, tickNo: number): Controls {
  const t = goal(g, p, step);
  if (!t) return IDLE;
  const { arrived, next } = route(g, p, t.s);
  if (!arrived) {
    if (!next) return IDLE;
    const dx = next[0] + 0.5 - p.x,
      dy = next[1] + 0.5 - p.y,
      l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l, a: 0, b: false };
  }
  const fx = t.s.tx + 0.5 - p.x,
    fy = t.s.ty + 0.5 - p.y,
    l = Math.hypot(fx, fy) || 1;
  const face = { x: fx / l, y: fy / l };
  const onIt = targetStation(g, p) === t.s;
  if (t.how === 'chop') return { ...face, a: 0, b: onIt };
  if (!onIt || tickNo - m.lastPress < PRESS_EVERY) return { ...face, a: 0, b: false };
  m.lastPress = tickNo;
  return { ...face, a: 1, b: false };
}

export interface SchoolRun {
  school: School;
  sent: ClientMsg[];
  ticks: number;
  steps: Map<number, number[]>;
} // steps: chef -> the sim time (ms) at which each step finished
/**
 * Runs a session until everybody is done or `limitMs` of sim time passed. `join` says when (sim ms) each chef shows up (default 0); `known` chefs are done on arrival.
 * `members` is re-evaluated every tick, so a test can connect and drop chefs by editing it.
 */
export function runSchool(
  members: SchoolMember[],
  o: {
    limitMs?: number;
    join?: Record<number, number>;
    useKnown?: boolean;
    bus?: Emitter<GameEvents>;
    tap?: number[];
    idle?: number[];
    every?: (ms: number, school: School) => void;
    until?: (ms: number, school: School) => boolean;
  } = {},
): SchoolRun {
  const sent: ClientMsg[] = [];
  const steps = new Map<number, number[]>();
  let ms = 0;
  const school = createSchool({
    bus: o.bus ?? new Emitter<GameEvents>(),
    send: (m) => sent.push(m),
    useKnown: o.useKnown,
    onAdvance: (id) => {
      const a = steps.get(id) ?? [];
      a.push(ms);
      steps.set(id, a);
    },
  });
  const mem = new Map<number, BotMem>();
  const sentB = new Set<number>(); // chefs that tap B: ONE press per chop, never held (what Ayudante is for)
  const limit = o.limitMs ?? 240_000;
  let ticks = 0;
  while (ms < limit) {
    const roster = members.filter((m) => ms >= (o.join?.[m.id] ?? 0));
    school.step(TICK_MS, roster, (id) => {
      const p = school.game.players.get(id)!,
        pr = school.progressOf(id);
      const mm = mem.get(id) ?? { lastPress: -99, stuck: 0 };
      mem.set(id, mm);
      if (o.idle?.includes(id)) return IDLE; // a chef that stands still
      const c = botControls(school.game, p, pr?.step ?? 0, mm, ticks);
      if (!o.tap?.includes(id)) return c;
      if (!c.b) {
        sentB.delete(id);
        return c;
      }
      const first = !sentB.has(id);
      sentB.add(id);
      return { ...c, b: false, bTaps: first ? 1 : 0 };
    });
    ticks++;
    ms += TICK_MS;
    o.every?.(ms, school);
    if (o.until ? o.until(ms, school) : school.everyoneDone) break;
  }
  return { school, sent, ticks, steps };
}
export { SCHOOL_TOTAL };
