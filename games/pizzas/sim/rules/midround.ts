// Events in the middle of a round (council: "Eventos a mitad de ronda"). Pure and deterministic: the event of a round and the instant it
// starts come from the round seed through a stream of their own (seed XOR EVENTS_SEED_TAG), so the orders' streams are never touched. The sim
// calls midTick only when `g.mid` exists, i.e. a round whose config switched events on; without it nothing here runs and no event is emitted.
//
// ONE event per round, starting between 1:00 and 2:00 of the match, announced ANNOUNCE_MS before with a banner (one at a time by construction).
//   rush       Hora punta         three orders at once in every queue
//   inspector  Inspector          for INSPECTOR_MS: a team with no dirty plate left when it ends gets +100 (only on maps with plates to wash)
//   blackout   Corte de luz       every oven is off for 10 s (it does not cook, and the grace time of a ready pizza does not run)
//   birthday   Pedido de cumpleaños  a pizza order worth 150 flat in every queue
//   frost      Ola de frío        every floor tile is ice for FROST_MS (the playtest of 25-oct: a patch of ice did nothing; a frozen kitchen is a different game for a while). Cooperative only
//   spill      Derrame            six patches of oil on the floor (mech/oil, only in a round with the oil mechanic)
//   rat        Rata               a rat steals the item of a counter; a dash scares it (and the item goes back). Cooperative only
// Versus: the same event, at the same instant, to both teams (one global state). The rat is never in the pool there (it would double the sabotage).
import { ANNOUNCE_MS } from './announce';
import type { EventKind, Mid } from './types';
export type { EventKind, Mid, Rat } from './types';
import { mulberry32 } from '@pichi/core';
import { newSurfaceState } from '../surfaces/config';
import type { Game } from '../round/state';
import { spill } from '../mech/oil/spill';
import { hazardParams } from '../hazards/hazard-v2';
import { hz3Params } from '../hazards/hazard-v3';
import { book } from '../hazards/score-ledger';
import { planEvents, type Planned } from '../hazards/events-v2';
import { endVersusRats, spawnVersusRats, stepVersusRats, versusRats } from '../feel/rat-versus';
import { ev2End, ev2SpillWatch, ev2Spilt, ev2Start, ev2Tick } from '../ev2/events';
import { ACTIVE_MS, EVENTS_SEED_TAG, EVENT_KINDS, EVENT_FROM_MS, EVENT_TO_MS, INSPECTOR_BONUS } from './event-catalog';
import { COOP_RAT, ratGone, ratStep, spawnRat } from './rat-event';

export * from './event-catalog';
export * from './rat-event';
export { ANNOUNCE_MS } from './announce';

/** What the sim does for the two events that touch the queues; passed in so this file keeps no value import of the sim (the imports stay acyclic). */
export interface MidFx {
  rush(g: Game): void;
  birthday(g: Game): void;
}

const tag = (g: Game, team: number): { team?: number } => (g.versus ? { team } : {});

/** The kinds this round can have: no rat in versus, no inspector without plates to wash, no rat without counters. */
export const eventPool = (g: Pick<Game, 'versus' | 'finitePlates' | 'stations' | 'frostEvent' | 'flags' | 'vz3'>): EventKind[] =>
  EVENT_KINDS.filter((k) =>
    k === 'rat'
      ? (!g.versus || !!g.vz3) && g.stations.some((s) => s.kind === 'counter')
      : k === 'inspector'
        ? g.finitePlates
        : k === 'frost'
          ? g.frostEvent && (!g.versus || !!g.vz3)
          : k === 'spill'
            ? !!g.flags?.mech.oil && !g.versus
            : true,
  );

/** The event of the round: kind and instant from the seed. */
export function createMid(g: Game, seed: number): Mid {
  const rng = mulberry32((seed ^ EVENTS_SEED_TAG) >>> 0);
  const pool = eventPool(g);
  const plan = g.hz ? planEvents(seed, g.difficulty, g.params.roundMs, pool, (k) => activeMs(g, k)) : [];
  if (plan.length) {
    // HAZARD_V2: the calendar comes from its own stream; `rng` stays untouched for the hole of the rat and the oil
    const [first, ...rest] = plan as [Planned, ...Planned[]];
    return {
      kind: first.kind,
      announceAt: first.startAt - ANNOUNCE_MS,
      startAt: first.startAt,
      endAt: Infinity,
      phase: 'wait',
      dark: false,
      frost: false,
      rat: null,
      rng,
      queue: rest,
    };
  }
  const kind = pool[Math.floor(rng() * pool.length)]!;
  const startAt = EVENT_FROM_MS + Math.floor(rng() * (EVENT_TO_MS - EVENT_FROM_MS + 1));
  return { kind, announceAt: startAt - ANNOUNCE_MS, startAt, endAt: Infinity, phase: 'wait', dark: false, frost: false, rat: null, rng };
}

/** How long an event counts as on: the table, except the blackout (12 s Normal, 15 s Hard under HAZARD_V2). */
export const activeMs = (g: Pick<Game, 'difficulty'>, k: EventKind): number =>
  k === 'blackout' ? hazardParams(g.difficulty).events.blackoutMs : ACTIVE_MS[k];

// --- The inspector ----------------------------------------------------------------------------------------------------------------------------------
/** Dirty plates that physically lie in a team's kitchen: at the return window, in the sink, on a counter or in a chef's hands. */
export function dirtyPlates(g: Game, team: number): number {
  let n = 0;
  for (const s of g.stations) {
    if ((s.owner ?? team) !== team) continue;
    if (s.kind === 'dirty' || s.kind === 'sink') n += s.count;
    if (s.kind === 'counter' && s.item === 'dirty') n++;
  }
  for (const p of g.players.values()) if (p.team === team && p.item === 'dirty') n++;
  return n;
}

function inspect(g: Game) {
  for (const t of g.teams) {
    const passed = dirtyPlates(g, t.id) === 0;
    const points = passed ? Math.round(INSPECTOR_BONUS * t.k) : 0;
    if (passed) {
      t.score += points;
      book(g, 'event:inspector', points);
      t.gross += INSPECTOR_BONUS;
      t.reachedAt = g.time;
    }
    g.bus.emit('event:inspector', { passed, points, ...tag(g, t.id) });
  }
}

// --- The clock of the event -------------------------------------------------------------------------------------------------------------------------
export function midTick(g: Game, dtMs: number, fx: MidFx) {
  const m = g.mid!;
  if (g.ev2) ev2SpillWatch(g); // EVENTS_V2: the oil of the Derrame outlives the event (it is `done` after 3 s), so this runs before the phase checks
  if (m.phase === 'done') return;
  if (m.phase === 'wait' && g.time >= m.announceAt) {
    m.phase = 'announced';
    g.bus.emit('event:announce', { kind: m.kind, inMs: ANNOUNCE_MS });
  }
  if (m.phase === 'announced' && g.time >= m.startAt) {
    m.phase = 'active';
    const dur = m.queue ? activeMs(g, m.kind) : ACTIVE_MS[m.kind];
    m.endAt = m.startAt + dur;
    g.bus.emit('event:start', { kind: m.kind, durationMs: dur });
    if (g.ev2) ev2Start(g, m); // EVENTS_V2: the board, the mood
    if (m.kind === 'rush') fx.rush(g);
    else if (m.kind === 'birthday') fx.birthday(g);
    else if (m.kind === 'blackout') m.dark = true;
    else if (m.kind === 'frost') {
      m.frost = true;
      g.surf ??= newSurfaceState(); // the ice rules only run in a round that has `surf`
    } else if (m.kind === 'spill') {
      const tiles = spill(g, m.rng);
      if (g.ev2) ev2Spilt(g, tiles, hz3Params(g).oil.spillDry);
    } else if (m.kind === 'rat') {
      if (g.versus) spawnVersusRats(g, m);
      else spawnRat(g, m);
    }
    return;
  }
  if (m.phase !== 'active') return;
  if (m.kind === 'rat' && g.versus) stepVersusRats(g, m, dtMs, COOP_RAT);
  else if (m.kind === 'rat' && m.rat) ratStep(g, m, dtMs);
  if (g.ev2) ev2Tick(g, m, dtMs); // EVENTS_V2: the board of the blackout may end the event now
  if (g.time < m.endAt && !(m.kind === 'rat' && !m.rat && !(g.versus && versusRats(m).length))) return;
  m.phase = 'done';
  if (m.kind === 'blackout') m.dark = false;
  else if (m.kind === 'frost') m.frost = false;
  else if (m.kind === 'inspector') inspect(g);
  else if (m.kind === 'rat') {
    if (g.versus) endVersusRats(g, m, COOP_RAT);
    else ratGone(g, m);
  }
  if (g.ev2) ev2End(g, m); // EVENTS_V2: the closing card and the prize
  g.bus.emit('event:end', { kind: m.kind });
  const next = m.queue?.shift();
  if (next)
    Object.assign(m, {
      kind: next.kind,
      announceAt: next.startAt - ANNOUNCE_MS,
      startAt: next.startAt,
      endAt: Infinity,
      phase: 'wait',
      dark: false,
      frost: false,
      rat: null,
      rats: undefined,
    }); // the next one of the calendar
}
