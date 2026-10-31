// The order queues: new orders, the golden (VIP) order, deliveries at the window, the tip streak, and the end-of-tick pass over every queue.
import { DIRTY_MS, type Tuning } from '@pichi/core/difficulty';
import { WARNING_MS, tag, type Game, type Order, type Player, type TeamState } from './state';
import { BIRTHDAY_POINTS, EVENT_MAX_QUEUE, RUSH_ORDERS, type MidFx } from '../midround';
import { rushOrdersV2 } from '../hazards/events-v2';
import { pickOrder, pickRecipe } from '../recipes/sim';
import { VIP_EVERY_MS, VIP_MULT, VIP_TTL_MS } from '../versus/versus';
import { isDish, recipeBase } from '../recipes/defs';
import { adaptiveDue, patienceMs } from '../recipes/pacing';
import { bandejaBase, bandejaPatienceMs, pickParts, takePart } from '../recipes/bandeja';
import { casaExtras } from '../recipes/casa';
import { book } from '../hazards/score-ledger';
import { ev2Cake, ev2CakeBlocks, ev2CakeServed, ev2Expired, ev2RedServed, ev2RushMark } from '../ev2/events';
import { CAKE_PRIZE } from '../ev2/state';

// R15: the tip multiplier for a delivery made after `streak` correct ones in a row.
export const tipMultiplier = (streak: number, t: Tuning) => Math.min(t.streakMax, 1 + Math.max(0, streak));

// A new order for the team. In versus the recipe is drawn at EVERY slot, admitted or not, so both queues see the same recipe at the
// same instant whatever each team has delivered; coop draws only when the order is admitted (the golden rounds pin that).
export const spawnOrder = (g: Game, team: TeamState = g.teams[0]!, force = false) => {
  const room = team.orders.length < (force ? EVENT_MAX_QUEUE : g.params.maxOrders); // force: the rush event, which may fill the strip beyond the usual queue
  if (!room && !g.versus && !force) return;
  const recipe = pickRecipe(g, team.rng, team);
  if (!room) return;
  const parts = recipe === 'bandeja' ? pickParts(g, team.rng) : undefined; // the three plates of a Bandeja: drawn only when one comes up
  const o: Order = {
    id: team.orderSeq++,
    expiresAt: g.time + (parts ? bandejaPatienceMs(g, parts) : patienceMs(g, recipe)),
    warned: false,
    recipe,
    ...(parts ? { parts } : {}),
  };
  team.orders.push(o);
  g.bus.emit('orderNew', { order: o.id, recipe, ...tag(g, team.id) });
};

// The golden order: the same recipe in every queue (one draw from its own stream), 30 s of patience, whatever the queue holds.
export function spawnVip(g: Game) {
  const recipe = pickRecipe(g, g.vip.rng);
  g.vip.round = { recipe, winners: [], settled: false };
  g.vip.nextAt += VIP_EVERY_MS[g.difficulty];
  for (const t of g.teams) {
    const o: Order = { id: t.orderSeq++, expiresAt: g.time + VIP_TTL_MS, warned: false, recipe, vip: true };
    t.orders.push(o);
    g.bus.emit('orderNew', { order: o.id, recipe, team: t.id, vip: true });
  }
  g.bus.emit('vipNew', { recipe });
}

// End of the tick: the VIP has a winner, so the rival's golden order turns into a normal one (it keeps its pizza and its patience).
export function settleVip(g: Game) {
  const r = g.vip.round;
  if (!r || r.settled || !r.winners.length) return;
  r.settled = true;
  for (const t of g.teams) {
    if (r.winners.some((w) => w.team === t.id)) continue;
    const o = t.orders.find((x) => x.vip);
    if (o) {
      delete o.vip;
      g.bus.emit('vipLost', { team: t.id });
    }
  }
}

function resetStreak(g: Game, team: TeamState) {
  if (team.streak === 0) return;
  team.streak = 0;
  g.bus.emit('streak', { n: 0, mult: 1, ...tag(g, team.id) });
}

// A at the delivery window: the dish pays the order it matches (or is refused and comes back dirty).
export function deliver(g: Game, p: Player) {
  if (isDish(p.item) && g.teams[p.team]!.orders.length) {
    const team = g.teams[p.team]!;
    if (g.ev2 && ev2CakeBlocks(g, p, team, (os) => pickOrder(g, os, p.item!))) return; // EVENTS_V2: no candle yet, the cake is not served
    const at = pickOrder(g, team.orders, p.item!); // recipes/sim.ts: the golden order first, then the birthday one, then the order that asked for this plate (a Margarita also satisfies a Marinara order, never the other way round)
    if (at < 0) {
      // R16: the wrong plate is refused, goes back dirty and pays nothing
      if (g.finitePlates) team.dirtyDue.push(g.time + DIRTY_MS);
      p.item = null;
      team.rejected++;
      resetStreak(g, team);
      g.bus.emit('dishRejected', { player: p.id, ...tag(g, team.id) });
      return;
    }
    const item = p.item!;
    if (team.orders[at]!.recipe === 'bandeja' && !takePart(g, team, team.orders[at]!, p)) return; // a plate of the Bandeja: into its slot, the tray pays with the third (recipes/bandeja.ts)
    const o = team.orders.splice(at, 1)[0]!;
    const { tune, orderTtlMs } = g.params;
    const birthday = !!o.birthday; // the event's order: BIRTHDAY_POINTS flat, no tip (the streak still counts)
    const extra = o.recipe === 'casa' ? casaExtras(g.difficulty, item) : { points: 0, tip: 1, bonus: 1 }; // the upgrades of a Pizza de la casa (casa.ts); nothing for any other order
    const base = birthday
      ? o.cake
        ? CAKE_PRIZE[g.difficulty]
        : BIRTHDAY_POINTS
      : o.recipe === 'bandeja'
        ? bandejaBase(g, o, tune)
        : recipeBase(o.recipe, tune) + extra.points; // R13
    const left = Math.min(1, Math.max(0, o.expiresAt - g.time) / orderTtlMs);
    const mult = birthday ? 1 : tipMultiplier(team.streak, tune); // R15: the streak multiplies only the tip
    const tip = birthday ? 0 : Math.round(base * tune.tipPct * left * extra.tip) * mult; // R14: up to +50% of the base, by the patience left
    const vip = !!o.vip; // won the golden order: x2. Another team delivering it in this same tick wins it too (settleVip runs at the end of the tick)
    const raw = (base + tip) * (vip ? VIP_MULT : 1) * extra.bonus;
    const gain = Math.round(raw * team.k); // the handicap k of this instant
    team.score += gain;
    book(g, birthday ? 'event:birthday' : vip ? 'event:vip' : 'delivery', gain);
    team.gross += raw;
    team.reachedAt = g.time;
    team.tips += tip;
    team.delivered++;
    team.streak++;
    team.bestStreak = Math.max(team.bestStreak, team.streak);
    if (g.finitePlates) team.dirtyDue.push(g.time + DIRTY_MS);
    p.item = null;
    g.bus.emit('delivered', {
      player: p.id,
      points: gain,
      tip,
      base,
      mult,
      ...(g.versus ? { team: team.id, k: team.k, ...(vip ? { vip: true as const } : {}) } : {}),
    });
    g.bus.emit('streak', { n: team.streak, mult: tipMultiplier(team.streak, tune), ...tag(g, team.id) });
    if (g.ev2 && o.cake) ev2CakeServed(g, p, gain);
    else if (g.ev2 && o.red) ev2RedServed(g);
    if (vip) {
      const round = g.vip.round!;
      team.vips++;
      round.winners.push({ team: team.id, at: g.time });
      g.bus.emit('vipWon', { team: team.id, player: p.id, tie: round.winners.length > 1 });
    }
  }
}

// The two mid-round events that touch the queues: a rush is three orders in every queue (drawn at every slot, so the twin queues stay twins); the birthday order is worth BIRTHDAY_POINTS flat.
export const MID_FX: MidFx = {
  rush(g) {
    for (const t of g.teams) {
      const first = t.orderSeq;
      for (
        let i = 0, n = g.hz && g.mid?.queue ? rushOrdersV2([...g.players.values()].filter((p) => p.team === t.id).length) : RUSH_ORDERS;
        i < n;
        i++
      )
        spawnOrder(g, t, true);
      if (g.ev2) ev2RushMark(g, t, first); // EVENTS_V2: these are the red tickets
    }
  },
  birthday(g) {
    for (const t of g.teams) {
      const o: Order = g.ev2
        ? ev2Cake(g, t) // EVENTS_V2: the card's most complex dish, with a candle step and its own countdown
        : { id: t.orderSeq++, expiresAt: g.time + g.params.orderTtlMs, warned: false, recipe: 'marinara', birthday: true };
      if (t.orders.length >= EVENT_MAX_QUEUE) t.orders.unshift(o);
      else t.orders.push(o); // a full strip still shows it
      g.bus.emit('orderNew', { order: o.id, recipe: o.recipe, ...tag(g, t.id), birthday: true });
    }
  },
};

// End of the tick for every queue: new orders on schedule, expired ones leave (and cost points and the streak), and orders about to expire warn.
export function ordersTick(g: Game) {
  for (const team of g.teams) {
    if (g.adaptive) {
      const gap = adaptiveDue(g, team);
      if (gap !== null) {
        spawnOrder(g, team);
        team.nextOrderAt = g.time + gap;
      }
    } else if (g.time >= team.nextOrderAt) {
      spawnOrder(g, team);
      team.nextOrderAt += g.params.orderEveryMs;
    }
    const alive = team.orders.filter((o) => o.expiresAt > g.time);
    for (const o of team.orders)
      if (!alive.includes(o)) {
        g.bus.emit('orderExpired', { order: o.id, ...tag(g, team.id) });
        if (g.ev2) ev2Expired(g, team, o); // EVENTS_V2: a red that expires punishes twice; the cake lost costs 50 / 100
      }
    const lost = team.orders.length - alive.length;
    const before = team.score;
    team.score = Math.max(0, team.score + lost * g.params.penalty); // the penalty is not multiplied by k
    if (team.score !== before) team.reachedAt = g.time;
    if (lost) book(g, 'penalty:expired', team.score - before);
    if (lost) {
      team.expired += lost;
      resetStreak(g, team);
    }
    team.orders = alive;
    for (const o of alive)
      if (!o.warned && o.expiresAt - g.time < WARNING_MS) {
        o.warned = true;
        g.bus.emit('orderWarning', { order: o.id, ...tag(g, team.id) });
      }
  }
}
