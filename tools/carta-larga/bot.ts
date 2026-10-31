// The scripted chefs of the Carta larga (measurement tool: nothing in the game imports it; the golden bot stays untouched). Same engine, same controls as games/pizzas/test/golden/recipe-bot.ts, but
// organised in JOBS, one per pizza: a job claims an oven when it starts, a sauce pot when it needs one, and walks the steps of tools/carta-larga/steps.ts. Any chef that can reach the station of the
// job's next step works on it. When the next step is across a wall (the H hatches of map 26: items cross, chefs do not), the chef puts what it holds on a hatch and parks the job; a chef of the
// other side picks it up there. New jobs follow the queue (a Bandeja asks for its plates one by one). A chef that has not moved for a while steps aside: two chefs head-on stop dead in the sim.
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
} from '@pichi/game-pizzas/sim/overcooked';
import { DIRS, fixedMap, floorComponents } from '@pichi/game-pizzas/sim/maps';
import { cardFor } from '@pichi/game-pizzas/sim/recipes/cards';
import type { Recipe } from '@pichi/game-pizzas/sim/recipes/defs';
import type { Difficulty } from '@pichi/core/difficulty';
import { RecBus, route } from '@pichi/game-pizzas/test/golden/bot';
import { stepsFor, type At, type Step } from './steps';

export interface Job {
  recipe: Recipe;
  steps: Step[];
  step: number;
  pot: Station;
  sp?: Station;
  owner: number | null;
  hatch?: Station; // where its item waits, across the wall
  at: number; // the last progress, ms of the sim
}
export interface CMem {
  job: Job | null;
  bin: boolean;
  lastPress: number;
  px: number;
  py: number;
  still: number;
  side?: { until: number; sign: number };
}
interface Crew {
  g: Game;
  jobs: Job[];
  comp: number[][];
  hatches: Station[];
  bind: readonly number[] | undefined;
  force?: Recipe;
}
const PRESS_EVERY = 12;
const STUCK_MS = 60_000;
const idle: Controls = { x: 0, y: 0, a: 0, b: false };

const sideOf = (c: Crew, p: { x: number; y: number }) => c.comp[Math.floor(p.y)]?.[Math.floor(p.x)] ?? -1;
/** Does the chef's side of the floor touch the station? */
const reaches = (c: Crew, p: Player, s: Station) => DIRS.some(([dx, dy]) => c.comp[s.ty + dy]?.[s.tx + dx] === sideOf(c, p));
const free = (s: Station) => !s.inputs.length && !s.done && !s.item && s.fire === undefined;
const claimed = (c: Crew, s: Station) => c.jobs.some((j) => j.pot === s || j.sp === s);
const near = (p: Player, a: Station[]) => a.sort((x, y) => Math.hypot(x.tx - p.x, x.ty - p.y) - Math.hypot(y.tx - p.x, y.ty - p.y));

/** The stations a chef may use for the step (the job's oven and sauce pot are its own). */
function stationsFor(c: Crew, p: Player, j: Job, at: At, rank: number): Station[] {
  if (at === 'pot') return reaches(c, p, j.pot) ? [j.pot] : [];
  if (at === 'saucepot') {
    if (j.sp) return reaches(c, p, j.sp) ? [j.sp] : [];
    return near(
      p,
      c.g.stations.filter((s) => s.kind === 'saucepot' && free(s) && !claimed(c, s) && reaches(c, p, s)),
    );
  }
  const kind = at === 'window' ? 'window' : at;
  const all = c.g.stations.filter((s) => (at.startsWith('crate') ? s.kind === 'crate' && s.crate === Number(at[5]) : s.kind === kind));
  const ok = all.filter((s) => reaches(c, p, s));
  return ok.length ? [ok[rank % ok.length]!] : [];
}

/** The plates the queue still asks for and no job is making (a Bandeja asks for the plates it has not got). */
function demand(c: Crew): Recipe[] {
  if (c.force) return [c.force];
  const need: Recipe[] = [];
  for (const o of c.g.teams[0]!.orders) {
    if (o.recipe === 'bandeja') o.parts?.forEach((r, i) => !o.served?.[i] && need.push(r));
    else need.push(o.recipe);
  }
  for (const j of c.jobs) {
    const i = need.indexOf(j.recipe);
    if (i >= 0) need.splice(i, 1);
  }
  return need;
}

function startJob(c: Crew, p: Player, rank: number): Job | null {
  const pot = near(
    p,
    c.g.stations.filter((s) => s.kind === 'pot' && free(s) && !claimed(c, s)),
  )[0];
  if (!pot) return null;
  for (const recipe of demand(c)) {
    const steps = stepsFor(recipe, c.bind, c.g.rec?.recipes.includes('blanca'));
    if (!steps) continue;
    const j: Job = { recipe, steps, step: 0, pot, owner: p.id, at: c.g.time };
    if (stationsFor(c, p, j, steps[0]!.at, rank).length) return j;
  }
  return null;
}
/** A parked job this chef can go on with: its item waits on a hatch of its side, or the next station is of its side. */
const takeParked = (c: Crew, p: Player, rank: number): Job | null =>
  c.jobs.find(
    (j) => j.owner === null && (!j.hatch || reaches(c, p, j.hatch)) && stationsFor(c, p, j, j.steps[j.step]!.at, rank).length > 0,
  ) ?? null;

function walk(m: CMem, p: Player, tickNo: number, rank: number, ux: number, uy: number): Controls {
  const moved = Math.hypot(p.x - m.px, p.y - m.py) > 0.01;
  m.px = p.x;
  m.py = p.y;
  m.still = moved ? 0 : m.still + 1;
  if (m.still > 15 && !m.side) m.side = { until: tickNo + 12 + (rank % 3) * 4, sign: rank % 2 ? 1 : -1 };
  if (m.side && tickNo >= m.side.until) {
    m.side = undefined;
    m.still = 0;
  }
  return m.side ? { x: -uy * m.side.sign, y: ux * m.side.sign, a: 0, b: false } : { x: ux, y: uy, a: 0, b: false };
}

function leave(m: CMem) {
  if (m.job) m.job.owner = null;
  m.job = null;
}
function drop(c: Crew, m: CMem) {
  if (m.job) c.jobs.splice(c.jobs.indexOf(m.job), 1);
  m.job = null;
  m.bin = true;
}

function decide(c: Crew, p: Player, rank: number, m: CMem, tickNo: number): Controls {
  const g = c.g;
  let j = m.job;
  if (!j && !m.bin) {
    j = takeParked(c, p, rank) ?? (p.item ? null : startJob(c, p, rank));
    if (j) {
      j.owner = p.id;
      j.at = g.time;
      c.jobs.includes(j) || c.jobs.push(j);
    } else if (p.item) m.bin = true; // stray item: bin it
    m.job = j;
  }
  let target: Station | undefined;
  let take: Step['take'] = 'a';
  let done = false;
  if (m.bin) {
    const bins = g.stations.filter(
      (s) => reaches(c, p, s) && (s.kind === 'trash' || (s.kind === 'counter' && !s.item && !c.hatches.includes(s))),
    );
    target = near(p, bins)[0];
    done = !p.item;
    if (done) m.bin = false;
  } else if (j) {
    if (j.hatch && p.item) j.hatch = undefined; // it has been taken off the hatch
    if (j.hatch) {
      target = j.hatch; // the plate of the other side: take it off the hatch
      if (reaches(c, p, target) && target.item) take = 'a';
    } else {
      const step = j.steps[j.step]!;
      target = stationsFor(c, p, j, step.at, rank)[0];
      take = step.take;
      if (target && step.at === 'saucepot') j.sp = target; // claim it from the first look: no other job takes it
      if (!target && step.at === 'saucepot' && reaches(c, p, j.pot)) return idle; // every sauce pot is in use: wait
      if (!target) {
        // the next station is across the wall: leave what is held on a hatch of this side and park the job
        if (!p.item) {
          leave(m);
          return idle;
        }
        const h = near(
          p,
          c.hatches.filter((s) => reaches(c, p, s) && !s.item && !c.jobs.some((o) => o.hatch === s)),
        )[0];
        if (!h) return idle;
        target = h;
        take = 'a';
        done = false;
        if (route(g, p, h).arrived && targetStation(g, p) === h && tickNo - m.lastPress >= PRESS_EVERY) {
          j.hatch = h; // the press below puts it there; the other side's chef takes the job from here
          leave(m);
        }
      } else done = step.done(g, p, target);
      if (done) {
        j.step++;
        j.at = g.time;
        if (step.at === 'saucepot' && p.item === 'sauce') j.sp = undefined; // the sauce is out: the pot is free
        if (j.step >= j.steps.length) {
          c.jobs.splice(c.jobs.indexOf(j), 1);
          m.job = null;
        }
        return idle;
      }
    }
  }
  if (!target) return idle;
  if (j && !m.bin && g.time - j.at > STUCK_MS) {
    drop(c, m);
    return idle;
  }
  const { arrived, next } = route(g, p, target);
  if (!arrived) {
    if (!next) return idle;
    const dx = next[0] + 0.5 - p.x,
      dy = next[1] + 0.5 - p.y,
      l = Math.hypot(dx, dy) || 1;
    return walk(m, p, tickNo, rank, dx / l, dy / l);
  }
  const fx = target.tx + 0.5 - p.x,
    fy = target.ty + 0.5 - p.y,
    l = Math.hypot(fx, fy) || 1;
  const face = { x: fx / l, y: fy / l };
  const onIt = targetStation(g, p) === target;
  const verb = m.bin ? 'a' : take;
  if (verb === 'chop' || verb === 'fold') return { ...face, a: 0, b: onIt };
  if (!onIt || tickNo - m.lastPress < PRESS_EVERY || (verb === 'serve' && !target.done)) return { ...face, a: 0, b: false };
  m.lastPress = tickNo;
  return { ...face, a: 1, b: false };
}

/** One coop round of the series (its flags on): `n` scripted chefs; `force` makes them all cook that recipe; `before(g)` runs ahead of each tick; `trace` sees the chefs' memory too. */
export function seriesRound(o: {
  mapId: string;
  difficulty: Difficulty;
  n: number;
  seed: number;
  force?: Recipe;
  extra?: Record<string, unknown>; // more createGame options: tools/hazards/stars-calibrate.ts passes the lobby's roundRules and `hazardsV2`; `adaptive: false` etc. for the classics
  before?: (g: Game) => void;
  trace?: (g: Game, mem: Map<number, CMem>, t: number) => void;
}): Game {
  const map = fixedMap(o.mapId)!;
  const bus = new RecBus();
  const g = createGame({
    mapId: map.id,
    difficulty: o.difficulty,
    n: o.n,
    rows: map.rows,
    spawns: map.spawns,
    seed: o.seed,
    countdownMs: COUNTDOWN_MS,
    bus,
    recipes: true,
    adaptive: true,
    upgradeOrders: true,
    sliceAfterBake: true,
    compoundOrders: true,
    ...o.extra,
  });
  const crew: Crew = {
    g,
    jobs: [],
    comp: floorComponents(g.grid).comp,
    hatches: g.stations.filter((s) => map.rows[s.ty]![s.tx] === 'H'),
    bind: cardFor(o.mapId)?.bind,
    ...(o.force ? { force: o.force } : {}),
  };
  const ids = Array.from({ length: o.n }, (_v, i) => i + 1);
  ids.forEach((id, rank) => addPlayer(g, id, rank, rank));
  const mem = new Map<number, CMem>(ids.map((id) => [id, { job: null, bin: false, lastPress: -99, px: -9, py: -9, still: 0 }]));
  const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS) + 60;
  for (let t = 0; !g.over && t < limit; t++) {
    bus.tick = t;
    o.before?.(g);
    o.trace?.(g, mem, t);
    const controls = new Map<number, Controls>();
    ids.forEach((id, rank) => controls.set(id, decide(crew, g.players.get(id)!, rank, mem.get(id)!, t)));
    tick(g, controls);
  }
  return g;
}
