// A scripted team for the T1e test maps (kneader and woodOven): the same recipe as the golden bot (dough, tomato, plate, window) but the dough goes through M when the kneader is on,
// and a chef feeds the fire of W when the woodOven is on. Pairing is a reserved job: the chef that put the ball on M works one handle, the lowest-id chef with free hands takes the other
// (it expires after 600 ticks). Reports what the design asks of the bot: stars, `pairWaitTicks` (a chef alone on a handle) and `stuckTicks` (the longest stretch with no step done by anybody).
import { DIRS, isFloor } from '../../../sim/maps';
import {
  COUNTDOWN_MS,
  TICK_MS,
  addPlayer,
  createGame,
  targetStation,
  tick,
  type Controls,
  type Game,
  type Player,
  type Station,
} from '../../../sim/overcooked';
import type { MechId } from '../../../sim/mech/ids';
import type { MapDef } from '../../../sim/maps';
import { handlesOf } from '../../../sim/mech/kneader/state';
import { feedOf } from '../../../sim/mech/woodOven/state';
import { summarize } from '../../../sim/results';
import type { Difficulty } from '@pichi/core/difficulty';

type At = 'crate0' | 'crate1' | 'board' | 'pot' | 'plates' | 'window' | 'M';
type Take = 'a' | 'chop' | 'serve';
interface Step {
  at: At;
  take: Take;
  done: (g: Game, p: Player, s: Station) => boolean;
}
const cut = (p: Player) => !!p.item && p.item.startsWith('cut');
const prepare = (crate: At, raw: string): Step[] => [
  { at: crate, take: 'a', done: (_g, p) => p.item === raw },
  { at: 'board', take: 'a', done: (_g, p) => !p.item },
  { at: 'board', take: 'chop', done: (_g, _p, s) => !!s.item && s.item.startsWith('cut') },
  { at: 'board', take: 'a', done: (_g, p) => cut(p) },
  { at: 'pot', take: 'a', done: (_g, p) => !p.item },
];
const kneaded: Step[] = [
  { at: 'crate0', take: 'a', done: (_g, p) => p.item === 'raw0' },
  { at: 'M', take: 'a', done: (_g, p) => !p.item },
  { at: 'M', take: 'a', done: (_g, p) => p.item === 'cut0' },
  { at: 'pot', take: 'a', done: (_g, p) => !p.item },
];
const TAIL: Step[] = [
  { at: 'plates', take: 'a', done: (_g, p) => p.item === 'plate' },
  { at: 'pot', take: 'serve', done: (_g, p) => p.item === 'dish' || p.item === 'dishQ' },
  { at: 'window', take: 'a', done: (_g, p) => !p.item },
];
const recipe = (kneader: boolean): Step[] => [...(kneader ? kneaded : prepare('crate0', 'raw0')), ...prepare('crate1', 'raw1'), ...TAIL];

interface Mem {
  step: number;
  since: number;
  lastPress: number;
  bin: boolean;
  oven?: Station;
  role?: 'help' | 'blow';
  until: number;
  px: number;
  py: number;
  still: number;
}
interface Crew {
  g: Game;
  kneader: boolean;
  wood: boolean;
  steps: Step[];
  helper: number | null;
  blower: number | null;
  owner: number | null;
  progress: number;
  pairWait: number;
}
const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const PRESS_EVERY = 12;
const STUCK_MS = 25_000;
const touches = (x: number, y: number, s: Station) => DIRS.some(([dx, dy]) => x + dx === s.tx && y + dy === s.ty);

/** BFS over floor: the next tile towards a goal (a tile test), or arrived. */
function route(g: Game, p: Player, goal: (x: number, y: number) => boolean) {
  const sx = Math.floor(p.x),
    sy = Math.floor(p.y);
  if (goal(sx, sy)) return { arrived: true, next: null as [number, number] | null };
  const prev = new Map<string, string | null>([[`${sx},${sy}`, null]]);
  const q: [number, number][] = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    if (goal(x, y)) {
      let k = `${x},${y}`;
      while (prev.get(k) && prev.get(prev.get(k)!) !== null) k = prev.get(k)!;
      return { arrived: false, next: k.split(',').map(Number) as [number, number] };
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy,
        k = `${nx},${ny}`;
      if (isFloor(g.grid, nx, ny) && !prev.has(k)) {
        prev.set(k, `${x},${y}`);
        q.push([nx, ny]);
      }
    }
  }
  return { arrived: false, next: null };
}

function stepTo(m: Mem, p: Player, next: [number, number], tickNo: number, rank: number): Controls {
  const moved = Math.hypot(p.x - m.px, p.y - m.py) > 0.01;
  m.px = p.x;
  m.py = p.y;
  m.still = moved ? 0 : m.still + 1;
  const dx = next[0] + 0.5 - p.x,
    dy = next[1] + 0.5 - p.y,
    l = Math.hypot(dx, dy) || 1;
  if (m.still > 20 && (tickNo + rank * 7) % 40 < 12) return { x: -dy / l, y: dx / l, a: 0, b: false }; // head-on with another chef: step aside
  return { x: dx / l, y: dy / l, a: 0, b: false };
}
const face = (p: Player, s: Station) => {
  const fx = s.tx + 0.5 - p.x,
    fy = s.ty + 0.5 - p.y,
    l = Math.hypot(fx, fy) || 1;
  return { x: fx / l, y: fy / l };
};

/** A job on a handle (help or own): stand on `h`, face M, hold B. */
function onHandle(c: Crew, p: Player, m: Mem, M: Station, h: readonly [number, number], tickNo: number, rank: number): Controls {
  const r = route(c.g, p, (x, y) => x === h[0] && y === h[1]);
  if (!r.arrived) return r.next ? stepTo(m, p, r.next, tickNo, rank) : idle;
  return { ...face(p, M), a: 0, b: targetStation(c.g, p) === M };
}

function decide(c: Crew, p: Player, rank: number, m: Mem, tickNo: number): Controls {
  const g = c.g;
  const M = g.stations.find((s) => s.kind === 'kneader');
  const Q = g.stations.find((s) => s.kind === 'bellows');
  const W = g.stations.find((s) => s.wood);
  const fuel = W ? (g.mech!.wood![g.stations.indexOf(W)] ?? 0) : 0;
  // helper: the second handle of a ball that is being kneaded
  if (m.role === 'help') {
    if (!M || M.item !== 'raw0' || tickNo > m.until) {
      m.role = undefined;
      c.helper = null;
    } else return onHandle(c, p, m, M, handlesOf(g, g.stations.indexOf(M))[c.owner === p.id ? 0 : 1]!, tickNo, rank);
  }
  if (M && c.helper === null && m.role === undefined && M.item === 'raw0' && c.owner !== p.id && (!p.item || p.item === 'raw0')) {
    c.helper = p.id;
    m.role = 'help';
    m.until = tickNo + 600;
    return idle;
  }
  // fogonero: blow until the fire is full
  if (m.role === 'blow') {
    if (!Q || fuel >= 850 || tickNo > m.until) {
      m.role = undefined;
      c.blower = null;
    } else {
      const r = route(g, p, (x, y) => touches(x, y, Q));
      if (!r.arrived) return r.next ? stepTo(m, p, r.next, tickNo, rank) : idle;
      return { ...face(p, Q), a: 0, b: targetStation(g, p) === Q };
    }
  }
  if (
    c.wood &&
    Q &&
    W &&
    c.blower === null &&
    ((!p.item && m.step === 0 && fuel < 250) || (fuel < 60 && (W.inputs.length > 0 || W.done) && W === m.oven)) &&
    W.fire === undefined &&
    feedOf(g, g.stations.indexOf(Q)) !== undefined
  ) {
    c.blower = p.id;
    m.role = 'blow';
    m.until = tickNo + 900;
    return idle;
  }
  const step = c.steps[m.step]!;
  const pots = g.stations.filter((s) => s.kind === 'pot');
  if (step.at === 'pot' && !m.oven) {
    const d = (s: Station) => Math.hypot(s.tx - p.x, s.ty - p.y);
    const normal = pots.filter((s) => !s.wood).sort((a, b) => d(a) - d(b));
    m.oven =
      (W && fuel >= 500 && !W.inputs.length && !W.done ? W : undefined) ?? normal.find((s) => !s.inputs.length && !s.done) ?? normal[0];
  }
  const list = m.bin
    ? g.stations.filter((x) => x.kind === 'trash' || x.kind === 'counter')
    : step.at === 'pot'
      ? m.oven
        ? [m.oven]
        : []
      : step.at === 'M'
        ? M
          ? [M]
          : []
        : g.stations.filter((s) =>
            step.at.startsWith('crate')
              ? s.kind === 'crate' && s.crate === Number(step.at[5])
              : s.kind === (step.at === 'window' ? 'window' : step.at),
          );
  const s = list.sort((a, b) => Math.hypot(a.tx - p.x, a.ty - p.y) - Math.hypot(b.tx - p.x, b.ty - p.y))[0];
  if (!s) return idle;
  if (m.bin ? !p.item : step.done(g, p, s)) {
    m.bin = false;
    m.since = g.time;
    c.progress++;
    if (step.at === 'M' && !p.item) {
      /* the ball is on M: this chef owns the job */ c.owner = p.id;
    }
    if (m.bin === false && m.step === c.steps.length - 1) {
      m.step = 0;
      m.oven = undefined;
    } else m.step = (m.step + 1) % c.steps.length;
    return idle;
  }
  if (g.time - m.since > STUCK_MS) {
    m.since = g.time;
    if (p.item) m.bin = true;
    else m.step = 0;
    m.oven = undefined;
    return idle;
  }
  // owner kneading: after putting the ball down, hold a handle until the dough is done
  if (step.at === 'M' && c.owner === p.id && M!.item === 'raw0' && !p.item) {
    const hs = handlesOf(g, g.stations.indexOf(M!));
    const mine = hs.reduce((b, h) => (Math.hypot(h[0] - p.x, h[1] - p.y) < Math.hypot(b[0] - p.x, b[1] - p.y) ? h : b));
    const lonely = !g.mech!.kneader![g.stations.indexOf(M!)]!.hands.some((id) => id > 0 && id !== p.id);
    if (lonely) c.pairWait++;
    return onHandle(c, p, m, M!, mine, tickNo, rank);
  }
  const r = route(g, p, (x, y) => touches(x, y, s));
  if (!r.arrived) return r.next ? stepTo(m, p, r.next, tickNo, rank) : idle;
  const f = face(p, s);
  const take = m.bin ? 'a' : step.take;
  if (take === 'chop') return { ...f, a: 0, b: targetStation(g, p) === s };
  if (targetStation(g, p) !== s || tickNo - m.lastPress < PRESS_EVERY || (take === 'serve' && !s.done)) return { ...f, a: 0, b: false };
  m.lastPress = tickNo;
  return { ...f, a: 1, b: false };
}

export interface MechRun {
  g: Game;
  stars: number;
  score: number;
  delivered: number;
  pairWaitTicks: number;
  stuckTicks: number;
  blocked: boolean;
}
/** One coop round of the test map with `n` scripted chefs. A round is `blocked` when no chef finished a step for 30 s of the match. */
export function playMech(o: {
  rows: readonly string[];
  mech: Partial<Record<MechId, boolean>>;
  n: number;
  seed: number;
  difficulty?: Difficulty;
  mutation?: MapDef['mutation']; // the v2 mutation of a map (needs `mutation` in `mech`)
}): MechRun {
  const g = createGame({
    mapId: '1',
    difficulty: o.difficulty ?? 'normal',
    n: o.n,
    rows: o.rows,
    seed: o.seed,
    countdownMs: COUNTDOWN_MS,
    mech: o.mech,
    mutation: o.mutation,
  });
  const crew: Crew = {
    g,
    kneader: !!o.mech.kneader,
    wood: !!o.mech.woodOven,
    steps: recipe(!!o.mech.kneader),
    helper: null,
    blower: null,
    owner: null,
    progress: 0,
    pairWait: 0,
  };
  const ids = Array.from({ length: o.n }, (_v, i) => i + 1);
  ids.forEach((id, rank) => addPlayer(g, id, rank, rank));
  const mem = new Map(ids.map((id) => [id, { step: 0, since: 0, lastPress: -99, bin: false, until: 0, px: -9, py: -9, still: 0 } as Mem]));
  const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS) + 60;
  let last = 0,
    lastProgress = -1,
    stuck = 0;
  for (let t = 0; !g.over && t < limit; t++) {
    const controls = new Map<number, Controls>();
    ids.forEach((id, rank) => controls.set(id, decide(crew, g.players.get(id)!, rank, mem.get(id)!, t)));
    tick(g, controls);
    if (g.time <= 0) continue;
    if (crew.progress !== lastProgress) {
      lastProgress = crew.progress;
      last = t;
    }
    stuck = Math.max(stuck, t - last);
  }
  const sm = summarize(g);
  return {
    g,
    stars: sm.stars,
    score: g.score,
    delivered: g.delivered,
    pairWaitTicks: crew.pairWait,
    stuckTicks: stuck,
    blocked: stuck > 1800,
  };
}
