// Test support of the T1b mechanics: a full coop round on a test map with the golden chefs (test/golden/bot.ts), their controls optionally rewritten each tick by the mechanic's bot job.
// Reports the stars, the score and the longest stall (no change in the kitchen for that many ticks: the "30 s without progress = fail" of the design). Nothing in the game imports it.
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from '../../../sim/overcooked';
import { summarize } from '../../../sim/results';
import { mechFlagsOf, type MechId } from '../../../sim/mech/ids';
import { RecBus, decide, type Mem } from '../../golden/bot';
import type { Difficulty } from '@pichi/core/difficulty';

export interface PlayOpts {
  rows: readonly string[];
  n: number;
  seed: number;
  mech: readonly MechId[];
  difficulty?: Difficulty;
  events?: boolean;
  frost?: boolean;
  assist?: (g: Game, base: Map<number, Controls>, t: number) => void;
  before?: (g: Game, t: number) => void;
}
export interface Played {
  g: Game;
  stars: number;
  score: number;
  delivered: number;
  stall: number; // longest run of ticks with the kitchen frozen
  ticks: number;
}

const signature = (g: Game) =>
  `${g.delivered}|${g.expired}|` +
  [...g.players.values()].map((p) => p.item ?? '-').join(',') +
  '|' +
  g.stations.map((s) => `${s.item ?? ''}${s.inputs.length}${s.done ? 1 : 0}${Math.floor(s.progress * 20)}${s.count}`).join(',');

export function playMech(o: PlayOpts): Played {
  const bus = new RecBus();
  const g = createGame({
    difficulty: o.difficulty ?? 'normal',
    n: o.n,
    rows: o.rows,
    seed: o.seed,
    countdownMs: COUNTDOWN_MS,
    bus,
    mech: mechFlagsOf(o.mech),
    surfaces: o.rows.some((r) => /[→←↑↓]/.test(r)),
    events: o.events,
    frost: o.frost,
  });
  const ids = Array.from({ length: o.n }, (_v, i) => i + 1);
  ids.forEach((id, rank) => addPlayer(g, id, rank, rank));
  const mem = new Map(ids.map((id) => [id, { step: 0, since: 0, lastPress: -99, bin: false } as Mem]));
  const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS) + 60;
  let sig = '',
    since = 0,
    stall = 0,
    t = 0;
  for (; !g.over && t < limit; t++) {
    bus.tick = t;
    o.before?.(g, t);
    const controls = new Map<number, Controls>();
    ids.forEach((id, rank) => controls.set(id, decide(g, g.players.get(id)!, rank, mem.get(id)!, t)));
    o.assist?.(g, controls, t);
    tick(g, controls);
    if (t % 30 === 0 && g.started) {
      const s = signature(g);
      if (s !== sig) {
        sig = s;
        since = t;
      }
      stall = Math.max(stall, t - since);
    }
  }
  return { g, stars: summarize(g).stars, score: g.score, delivered: g.delivered, stall, ticks: t };
}
