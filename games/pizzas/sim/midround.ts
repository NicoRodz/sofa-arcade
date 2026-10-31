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
import { DIRS, isFloor } from './maps';
import { mulberry32, type Rng } from '@pichi/core/rng';
import type { Difficulty } from '@pichi/core/difficulty';
import { magnetFor } from './feel/magnet';
import { newSurfaceState } from './surfaces/config';
import { gentleRatStep, ratPrize } from './feel/rat';
import { ratPull, stealOnEscape } from './feel/rat-loot';
import type { Game, Item, Station } from './round/state';
import { spill } from './mech/oil/spill';
import { hazardParams } from './hazards/hazard-v2';
import { hz3Params } from './hazards/hazard-v3';
import { book } from './hazards/score-ledger';
import { planEvents, type Planned } from './hazards/events-v2';
import { ev2End, ev2SpillWatch, ev2Spilt, ev2Start, ev2Tick } from './ev2/events';

export type EventKind = 'rush' | 'inspector' | 'blackout' | 'birthday' | 'rat' | 'frost' | 'spill';
export const EVENT_KINDS: readonly EventKind[] = ['rush', 'inspector', 'blackout', 'birthday', 'rat', 'frost', 'spill'];
export const EVENTS_SEED_TAG = 0xe7e47e55;
export const EVENT_FROM_MS = 60_000; // the event starts between these two instants of the match
export const EVENT_TO_MS = 120_000;
export const ANNOUNCE_MS = 3000; // the banner is up this long before it starts
export const ACTIVE_MS: Record<EventKind, number> = {
  rush: 3000,
  inspector: 20_000,
  blackout: 10_000,
  birthday: 3000,
  rat: 25_000,
  frost: 30_000,
  spill: 3000,
}; // how long it counts as "on" (the rat leaves earlier when it is gone)
export const RUSH_ORDERS = 3;
export const EVENT_MAX_QUEUE = 6; // a rush never grows a queue past what the order strip can show
export const INSPECTOR_BONUS = 100;
export const BIRTHDAY_POINTS = 150;
export const RAT_SPEED = 2.4; // tiles/s
export const RAT_FLEE_SPEED = 6;
export const RAT_PATIENCE_MS = 10_000; // the rat waits this long for a counter that holds something, then leaves
export const RAT_SCARE_RADIUS = 1.1; // a chef that is dashing this close to the rat scares it

/** Names for the banner and the lobby (Spanish: the screen shows them as they are). */
export const EVENT_INFO: Record<EventKind, { title: string; blurb: string }> = {
  rush: { title: '¡HORA PUNTA!', blurb: 'Llegan 3 pedidos de golpe' },
  inspector: { title: '¡INSPECTOR!', blurb: 'Sin platos sucios al terminar: +100' },
  blackout: { title: '¡CORTE DE LUZ!', blurb: 'Hornos apagados 10 s' },
  birthday: { title: '¡CUMPLEAÑOS!', blurb: 'Pedido triple: 150 puntos' },
  rat: { title: '¡UNA RATA!', blurb: 'Huye si te acercas: atrápala cuando jadee o arrinconada' },
  frost: { title: '¡OLA DE FRÍO!', blurb: 'Todo el piso es hielo 30 s' },
  spill: { title: '¡DERRAME!', blurb: 'Manchas de aceite por la cocina' },
};

/** The lobby option: events on or off. Missing = the difficulty's default (Sí in Normal and Difícil, No in Fácil). */
export const EVENTS_OPTION = 'events';
export const defaultEvents = (d: Difficulty) => d !== 'easy';
export const eventsOf = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined, d: Difficulty): boolean => {
  const v = modeOptions?.[EVENTS_OPTION];
  return typeof v === 'boolean' ? v : defaultEvents(d);
};

/** The lobby option: the map's Carta del día (recipes/cards.ts) on or off. Missing = on (there is no switch for it on the screen yet: a test or a later menu sets it to false). */
export const RECIPES_OPTION = 'recipes';
export const recipesOf = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined): boolean => {
  const v = modeOptions?.[RECIPES_OPTION];
  return typeof v === 'boolean' ? v : true;
};

/** How much faster than the base table the lobby rounds serve orders: the playtest of 25-oct found Normal too slack once the controls got good (spare time, one oven was enough). */
export const PACE: Record<Difficulty, number> = { easy: 1.2, normal: 1.6, hard: 1.8 };

/** What the lobby switches on for a round (coop and versus alike): the burning oven always (the sim leaves the fire out on Easy and under the Suave sabotage), the event by the option, the map's card of recipes, the magnetism of the chefs. */
export const roundRules = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined, d: Difficulty) => ({
  burn: true,
  fire: true,
  events: eventsOf(modeOptions, d),
  recipes: recipesOf(modeOptions),
  magnet: magnetFor(modeOptions, d),
  pace: PACE[d],
  frost: true,
}); // magnet (feel/magnet.ts): on in every lobby round, stronger in Easy; the option `magnet: false` turns it off

export interface Rat {
  x: number;
  y: number; // tile units, centre
  state: 'seek' | 'flee';
  item: Item | null; // what it carries
  from: number; // station index it stole from (-1: nothing yet)
  hole: [number, number]; // where it came in and where it leaves
  scared: boolean;
  idleMs: number;
  // the gentle rat only (feel/rat.ts): absent in a round without the magnet
  born?: number;
  heading?: number;
  runMs?: number;
  pauseMs?: number;
  target?: number;
  near?: boolean;
  // HAZARD_V2 (feel/rat-v2.ts): the dodge of a dash and the panting after it
  dodgeCd?: number;
  dodgeMs?: number;
  dodgeFrom?: [number, number];
  dodgeTo?: [number, number];
  pantMs?: number;
  dashers?: number[];
  evadeMs?: number; // feel/rat-evade.ts: a burst away from a chef in progress, its unit direction and cooldown
  evadeDx?: number;
  evadeDy?: number;
  evadeCd?: number;
}
export interface Mid {
  kind: EventKind;
  announceAt: number;
  startAt: number;
  endAt: number; // Infinity until it starts
  phase: 'wait' | 'announced' | 'active' | 'done';
  dark: boolean; // blackout in progress
  frost: boolean; // frost in progress: surfaces/physics reads it (every floor tile is ice)
  rat: Rat | null;
  rng: Rng; // the stream of the events (the instant, the kind, the hole of the rat)
  lossAt?: number; // HAZARD_V3: match time of the last item a hazard took (feel/rat-loot.ts)
  queue?: Planned[]; // HAZARD_V2: the events still to come after this one (events-v2.ts); absent = the old single event
}

/** What the sim does for the two events that touch the queues; passed in so this file keeps no value import of the sim (the imports stay acyclic). */
export interface MidFx {
  rush(g: Game): void;
  birthday(g: Game): void;
}

const tag = (g: Game, team: number): { team?: number } => (g.versus ? { team } : {});

/** The kinds this round can have: no rat in versus, no inspector without plates to wash, no rat without counters. */
export const eventPool = (g: Pick<Game, 'versus' | 'finitePlates' | 'stations' | 'frostEvent' | 'flags'>): EventKind[] =>
  EVENT_KINDS.filter((k) =>
    k === 'rat'
      ? !g.versus && g.stations.some((s) => s.kind === 'counter')
      : k === 'inspector'
        ? g.finitePlates
        : k === 'frost'
          ? g.frostEvent && !g.versus
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

// --- The rat ----------------------------------------------------------------------------------------------------------------------------------------
const tileOf = (r: Rat): [number, number] => [Math.floor(r.x), Math.floor(r.y)];

// First step (a tile) of a shortest path over floor tiles from `from` to any tile where `goal` holds; null when already there or unreachable.
function nextTile(g: Game, from: [number, number], goal: (x: number, y: number) => boolean): [number, number] | null {
  if (goal(from[0], from[1])) return null;
  const prev = new Map<string, string>([[`${from[0]},${from[1]}`, '']]);
  const queue: [number, number][] = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy,
        k = `${nx},${ny}`;
      if (!isFloor(g.grid, nx, ny) || prev.has(k)) continue;
      prev.set(k, `${x},${y}`);
      if (goal(nx, ny)) {
        let cur = k;
        while (prev.get(prev.get(cur)!) !== '') cur = prev.get(cur)!;
        const [sx, sy] = cur.split(',').map(Number) as [number, number];
        return [sx, sy];
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}

function spawnRat(g: Game, m: Mid) {
  const holes: [number, number][] = [];
  g.grid.forEach((row, y) =>
    row.forEach((_t, x) => {
      if (isFloor(g.grid, x, y) && DIRS.some(([dx, dy]) => g.grid[y + dy]?.[x + dx]?.kind === 'wall')) holes.push([x, y]);
    }),
  );
  const pool = holes.length ? holes : [[1, 1] as [number, number]];
  const hole = pool[Math.floor(m.rng() * pool.length)]!;
  m.rat = { x: hole[0] + 0.5, y: hole[1] + 0.5, state: 'seek', item: null, from: -1, hole, scared: false, idleMs: 0 };
  g.bus.emit('rat:appear', { at: hole });
}

function ratGone(g: Game, m: Mid) {
  const r = m.rat;
  if (!r) return;
  const took = stealOnEscape(g, m, r); // HAZARD_V3: an escaping rat takes an item with it
  m.rat = null;
  g.bus.emit('rat:gone', { stolen: r.item !== null || took });
}

function scareRat(g: Game, m: Mid, playerId: number) {
  const r = m.rat!;
  r.scared = true;
  r.state = 'flee';
  let returned = false;
  if (r.item) {
    // the thief drops its loot where it took it from, if that counter is still free
    const st: Station | undefined = g.stations[r.from];
    if (st && st.item === null && st.fire === undefined) {
      st.item = r.item;
      returned = true;
    }
    r.item = null;
  }
  const bonus = g.magnet ? ratPrize(g) : 0; // the gentle rat pays for being scared
  g.bus.emit('rat:scared', { player: playerId, returned, ...(bonus ? { bonus } : {}) });
}

function ratStep(g: Game, m: Mid, dtMs: number) {
  const r = m.rat!;
  if (g.magnet && gentleRatStep(g, m, dtMs, { nextTile, scare: scareRat, gone: ratGone, floor: (gg, x, y) => isFloor(gg.grid, x, y) }))
    return; // magnetism: the gentle rat (feel/rat.ts); once scared the old flee below takes over
  if (!r.scared)
    for (const p of g.players.values()) {
      if (p.ghost || p.dashMs <= 0 || Math.hypot(p.x - r.x, p.y - r.y) > RAT_SCARE_RADIUS) continue;
      scareRat(g, m, p.id);
      break;
    }
  let goal: (x: number, y: number) => boolean;
  if (r.state === 'seek') {
    // the nearest counter that holds something (ties by station index)
    let best = -1,
      bestD = Infinity;
    g.stations.forEach((s, i) => {
      if (s.kind !== 'counter' || !s.item || s.fire !== undefined) return;
      const d = Math.hypot(s.tx + 0.5 - r.x, s.ty + 0.5 - r.y) - ratPull(g, s.item);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) {
      // nothing to steal: wait for a while and then leave
      r.idleMs += dtMs;
      if (r.idleMs >= RAT_PATIENCE_MS) r.state = 'flee';
      return;
    }
    r.idleMs = 0;
    const s = g.stations[best]!;
    const [tx, ty] = tileOf(r);
    if (Math.abs(tx - s.tx) + Math.abs(ty - s.ty) === 1) {
      // next to it: grab
      r.item = s.item;
      r.from = best;
      s.item = null;
      r.state = 'flee';
      g.bus.emit('rat:steal', { station: best, item: r.item! });
      return;
    }
    goal = (x, y) => Math.abs(x - s.tx) + Math.abs(y - s.ty) === 1;
  } else {
    if (tileOf(r)[0] === r.hole[0] && tileOf(r)[1] === r.hole[1]) {
      ratGone(g, m);
      return;
    }
    goal = (x, y) => x === r.hole[0] && y === r.hole[1];
  }
  const step = nextTile(g, tileOf(r), goal);
  if (!step) return;
  const dx = step[0] + 0.5 - r.x,
    dy = step[1] + 0.5 - r.y,
    d = Math.hypot(dx, dy) || 1;
  const move = Math.min(d, ((r.scared ? RAT_FLEE_SPEED : RAT_SPEED) * dtMs) / 1000);
  r.x += (dx / d) * move;
  r.y += (dy / d) * move;
}

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
    } else if (m.kind === 'rat') spawnRat(g, m);
    return;
  }
  if (m.phase !== 'active') return;
  if (m.kind === 'rat' && m.rat) ratStep(g, m, dtMs);
  if (g.ev2) ev2Tick(g, m, dtMs); // EVENTS_V2: the board of the blackout may end the event now
  if (g.time < m.endAt && !(m.kind === 'rat' && !m.rat)) return;
  m.phase = 'done';
  if (m.kind === 'blackout') m.dark = false;
  else if (m.kind === 'frost') m.frost = false;
  else if (m.kind === 'inspector') inspect(g);
  else if (m.kind === 'rat') ratGone(g, m);
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
    }); // the next one of the calendar
}
