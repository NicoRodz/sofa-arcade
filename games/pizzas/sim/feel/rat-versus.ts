// VERSUS_V3, the rat in a versus round (design 2b "rata en espejo"): one rat PER KITCHEN, the same event, on the same tick, with the same behaviour.
// Mirror safety: the cave of each kitchen is the same pick in the canonical frame (team 1's kitchen; team 0's holes go through sigma), from a sub-stream tagged
// `rat:cave:<start tick>` of the event seed, never from the main stream. Each rat only reads its own kitchen: its counters, its chefs, its team.
// The coop rat code is reused as it is. Each tick a team's rat runs on a VIEW of the round (the same Game with this team's stations, chefs, score and bus) and a
// per-team Mid (`Object.create(mid)` with its own `rat` and `lossAt`). Stations keep their global index (a sparse array: `forEach` skips the other kitchen).
import { DIRS, isFloor, MAP_H, MAP_W } from '../maps';
import { SIGMAS } from '../maps/symmetry';
import { ratFrame } from './rat-frame';
import { mulberry32 } from '@pichi/core';
import { subSeed } from '../recipes/menu';
import type { Game, Station } from '../round/state';
import type { Mid, Rat } from '../rules/midround';

/** What the versus rat borrows from midround.ts (passed in: this file keeps no value import of the sim). */
export interface RatCoop {
  step(g: Game, m: Mid, dtMs: number): void;
  gone(g: Game, m: Mid): void;
}

/** The rats in play, one per kitchen (empty outside a versus rat event). */
export const versusRats = (m: Mid): Rat[] => (m.rats ?? []).flatMap((s) => (s.rat ? [s.rat] : []));

type Pt = [number, number];
const canon = (g: Game, team: number, p: Pt): Pt => {
  const sigma = g.vz3?.sigma;
  return sigma && team === 0 ? SIGMAS[sigma](p[0], p[1], MAP_W, MAP_H) : p; // team 1's kitchen is the canonical frame
};

/** The floor tiles of a kitchen where a rat can come in, sorted by (y, x) in the canonical frame: those that touch a wall; a kitchen with none (a versus map is ringed by counters) uses those that touch anything but floor. */
export function caves(g: Game, team: number): Pt[] {
  const k = g.kitchens!;
  const mine: Pt[] = [];
  g.grid.forEach((row, y) =>
    row.forEach((_t, x) => {
      if (k.comp[y]?.[x] === k.regions[team] && isFloor(g.grid, x, y)) mine.push([x, y]);
    }),
  );
  const near = (kind: (c: string | undefined) => boolean) =>
    mine.filter(([x, y]) => DIRS.some(([dx, dy]) => kind(g.grid[y + dy]?.[x + dx]?.kind)));
  const edge = near((c) => c === 'wall');
  const out = edge.length ? edge : near((c) => c !== 'floor');
  return (out.length ? out : mine).sort((a, b) => {
    const [ax, ay] = canon(g, team, a),
      [bx, by] = canon(g, team, b);
    return ay - by || ax - bx;
  });
}

/** Both rats come in on the same tick, each by its own cave. */
export function spawnVersusRats(g: Game, m: Mid) {
  const rng = mulberry32(subSeed(g.vz3!.seed, `rat:cave:${m.startAt}`));
  const draw = rng(); // one draw for both kitchens: the same index of the same canonical list
  m.rats = g.teams.map((t) => {
    const pool = caves(g, t.id);
    const hole = pool[Math.floor(draw * pool.length)] ?? ([1, 1] as Pt);
    const sub = Object.create(m) as Mid;
    sub.rat = { x: hole[0] + 0.5, y: hole[1] + 0.5, state: 'seek', item: null, from: -1, hole, scared: false, idleMs: 0 };
    g.bus.emit('rat:appear', { at: hole, team: t.id });
    return sub;
  });
}

/** `g` as one team's kitchen sees it. */
function view(g: Game, team: number): Game {
  const stations: Station[] = new Array(g.stations.length);
  const own: number[] = [];
  g.stations.forEach((s, i) => {
    if (s.owner !== team) return;
    stations[i] = s;
    own.push(i);
  });
  // `forEach` visits the counters in the canonical (y, x) order, so a tie between two at the same distance goes to the same counter in both kitchens
  own.sort((a, b) => {
    const [ax, ay] = canon(g, team, [stations[a]!.tx, stations[a]!.ty]),
      [bx, by] = canon(g, team, [stations[b]!.tx, stations[b]!.ty]);
    return ay - by || ax - bx;
  });
  Object.defineProperty(stations, 'forEach', { value: (cb: (s: Station, i: number) => void) => own.forEach((i) => cb(stations[i]!, i)) });
  const v = Object.create(g) as Game;
  const bus = g.bus;
  return Object.assign(v, {
    stations,
    players: new Map([...g.players].filter(([, p]) => p.team === team)),
    teams: [g.teams[team]!],
    ratFrame: ratFrame(g.vz3?.sigma, team),
    bus: { emit: (k: string, p: object) => bus.emit(k as never, { ...p, team } as never), on: bus.on.bind(bus) },
  });
}

export function stepVersusRats(g: Game, m: Mid, dtMs: number, coop: RatCoop) {
  (m.rats ?? []).forEach((sub, team) => {
    if (sub.rat) coop.step(view(g, team), sub, dtMs);
  });
}

export function endVersusRats(g: Game, m: Mid, coop: RatCoop) {
  (m.rats ?? []).forEach((sub, team) => {
    if (sub.rat) coop.gone(view(g, team), sub);
  });
}
