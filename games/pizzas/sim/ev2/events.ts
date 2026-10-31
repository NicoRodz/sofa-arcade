// EVENTS_V2: the rules of the events with presence, hooked from midround.ts (start / end / tick), round/orders.ts (the tickets) and round/chef.ts (the board, the candle).
// Hora punta: red tickets, "on time x/y", twice the penalty for a red that expires, +20 each / +100 for all. Cumpleaños: the cake is the card's most complex dish, it needs a candle
// from the drawer, 75 / 60 s. Corte de luz: hold B at the board to bring the light back (2 s, Hard: two chefs 1.5 s), or it comes back by itself. Coop only.
import type { Game, Order, Player, TeamState, Controls } from '../round/state';
import { RECIPE_PARTS } from '../recipes/defs';
import type { Mid } from '../midround';
import { book } from '../hazards/score-ledger';
import { aStation } from '../round/targeting';
import { announce, award } from './close';
import { BLACKOUT_PRIZE, CAKE_PENALTY, CAKE_TTL_MS, FAST_MS, HOLD_CHEFS, HOLD_MS, PERFECT_PRIZE, RED_PRIZE, near, pickSpot } from './state';

const mood = (g: Game, kind: Mid['kind'], on: boolean) => g.bus.emit('ev2:mood', { kind, on });

/** midround: an event just went active. The rush and the birthday build their orders in MID_FX (orders.ts) and call the marks below. */
export function ev2Start(g: Game, m: Mid) {
  const e = g.ev2!;
  if (m.kind === 'blackout') {
    e.board = pickSpot(g);
    e.hold = 0;
    e.holders = [];
    e.restoredAt = null;
  }
  mood(g, m.kind, true);
}

/** midround: the event ended (its clock ran out, or the light came back). */
export function ev2End(g: Game, m: Mid) {
  const e = g.ev2!;
  if (m.kind === 'blackout') {
    const t = e.restoredAt === null ? null : e.restoredAt - m.startAt;
    if (t === null) announce(g, 'blackout', 0, 'La luz volvió sola', 'Sin premio', false);
    else
      award(
        g,
        'blackout',
        'event:blackout',
        t < FAST_MS ? BLACKOUT_PRIZE.fast : BLACKOUT_PRIZE.slow,
        `Luz en ${(t / 1000).toFixed(1)} s`,
        'Cocina iluminada',
        true,
      );
    e.board = null;
    mood(g, 'blackout', false);
  } else if (m.kind === 'spill') mood(g, 'spill', false);
}

/** midround, each tick of an active event, before its end check: the board of the blackout. */
export function ev2Tick(g: Game, m: Mid, dtMs: number) {
  const e = g.ev2!;
  if (m.kind !== 'blackout' || !m.dark || !e.board) return;
  const need = Math.min(HOLD_CHEFS[g.difficulty], [...g.players.values()].filter((p) => !p.ghost).length);
  e.hold = e.holders.length >= need ? e.hold + dtMs : Math.max(0, e.hold - 2 * dtMs);
  e.holders = [];
  if (e.hold >= HOLD_MS[g.difficulty]) {
    e.restoredAt = g.time;
    m.endAt = g.time; // the end branch of midTick closes the event on this very tick
  }
}

/** chef.ts: a chef holding B at the board of a dark kitchen. True = it stays put (the dash and the stick do nothing). */
export function ev2Hold(g: Game, p: Player, c: Controls): boolean {
  const e = g.ev2!;
  if (!g.mid?.dark || !e.board || !c.b || !near(p, e.board)) return false;
  e.holders.push(p.id);
  return true;
}

/** chef.ts: A at the candle drawer lights the cake's candle. True = the presses were used. */
export function ev2Candle(g: Game, p: Player, c: Controls): boolean {
  const k = g.ev2!.cake;
  if (!k || k.closed || k.candled || c.a <= 0 || !near(p, k.drawer)) return false;
  const s = aStation(g, p);
  if (s && g.stations.indexOf(s) !== k.drawer.station) return false;
  k.candled = true;
  k.by = p.id;
  g.bus.emit('ev2:cake', { step: 'candle', player: p.id });
  return true;
}

// --- Hora punta -------------------------------------------------------------------------------------------------------------------------------------
/** orders.ts, after the rush spawned its orders: the ones with id >= `first` are red. */
export function ev2RushMark(g: Game, t: TeamState, first: number) {
  const reds = t.orders.filter((o) => o.id >= first);
  for (const o of reds) o.red = true;
  g.ev2!.rush = { total: reds.length, ok: 0, late: 0, closed: false };
}

function rushClose(g: Game) {
  const r = g.ev2!.rush!;
  if (r.closed || r.ok + r.late < r.total) return;
  r.closed = true;
  const perfect = r.late === 0;
  const pts = r.ok * RED_PRIZE + (perfect ? PERFECT_PRIZE : 0);
  const bad = r.ok * 2 < r.total;
  award(
    g,
    'rush',
    'event:rush',
    pts,
    perfect ? '¡Servicio perfecto!' : bad ? 'Clientes molestos' : 'Servicio cumplido',
    `${r.ok}/${r.total} a tiempo`,
    !bad,
  );
  mood(g, 'rush', false);
}

/** orders.ts: a red ticket was served. */
export function ev2RedServed(g: Game) {
  g.ev2!.rush!.ok++;
  rushClose(g);
}

// --- Cumpleaños -------------------------------------------------------------------------------------------------------------------------------------
/** The card's most complex dish (components + processes; the first of the card on a tie). */
export function cakeRecipe(g: Game): Order['recipe'] {
  const list = g.rec?.recipes ?? ['marinara'];
  let best = list[0]!,
    score = -1;
  for (const r of list) {
    const s = RECIPE_PARTS[r].components + RECIPE_PARTS[r].processes;
    if (s > score && r !== 'bandeja') {
      best = r;
      score = s;
    }
  }
  return best;
}

/** orders.ts MID_FX.birthday under eventsV2: the cake order, with its own countdown and its candle drawer next to the window. */
export function ev2Cake(g: Game, t: TeamState): Order {
  const win = g.stations.find((s) => s.kind === 'window');
  const recipe = cakeRecipe(g);
  const o: Order = { id: t.orderSeq++, expiresAt: g.time + CAKE_TTL_MS[g.difficulty], warned: false, recipe, birthday: true, cake: true };
  const drawer = pickSpot(g, win ? { x: win.tx + 0.5, y: win.ty + 0.5 } : undefined) ?? { tx: win?.tx ?? 1, ty: win?.ty ?? 1, station: -1 };
  g.ev2!.cake = { drawer, candled: false, by: null, order: o.id, closed: false };
  return o;
}

/** orders.ts deliver(): a cake with no candle yet is not served (the chef keeps the dish). True = blocked. */
export function ev2CakeBlocks(g: Game, p: Player, team: TeamState, fits: (orders: readonly Order[]) => number): boolean {
  const k = g.ev2!.cake;
  if (!k || k.closed || k.candled) return false;
  const cake = team.orders.find((o) => o.cake);
  if (!cake || fits([cake]) < 0 || fits(team.orders.filter((o) => !o.cake)) >= 0) return false;
  g.bus.emit('interactInvalid', { player: p.id });
  return true;
}

/** orders.ts deliver(): the cake was served (the points were paid by deliver). */
export function ev2CakeServed(g: Game, p: Player, points: number) {
  const k = g.ev2!.cake!;
  k.closed = true;
  announce(g, 'birthday', points, '¡Torta entregada!', 'Cumpleaños feliz', true, p.id);
  g.bus.emit('ev2:cake', { step: 'served', player: p.id });
  mood(g, 'birthday', false);
}

/** orders.ts ordersTick(): an order expired. A red costs another penalty; the cake costs 50 / 100 and a balloon. */
export function ev2Expired(g: Game, t: TeamState, o: Order) {
  const e = g.ev2!;
  if (o.red && e.rush && !e.rush.closed) {
    const before = t.score;
    t.score = Math.max(0, t.score + g.params.penalty); // a red that expires punishes twice (ordersTick took the first)
    book(g, 'penalty:rush', t.score - before);
    e.rush.late++;
    rushClose(g);
  }
  if (o.cake && e.cake && !e.cake.closed) {
    e.cake.closed = true;
    award(g, 'birthday', 'event:birthday', CAKE_PENALTY[g.difficulty], 'Torta vencida', 'Un globo se desinfló', false);
    g.bus.emit('ev2:cake', { step: 'expired' });
    mood(g, 'birthday', false);
  }
}
