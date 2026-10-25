// The Cocina escuela session: the REAL sim (same stations, same buttons, same hints) on a small dedicated kitchen, with no clock, no orders that run out and no score
// shown. Each chef has its own progress (steps.ts) and moves on when the sim says it did the thing. Pure: the browser screen and the Node tests drive it the same way
// (`step` with the roster and a function that hands over each chef's controls), and it only talks through `send` (the hints of the contextual buttons and the
// school messages to the phones).
import type { Emitter, GameEvents } from '@pichi/core/events';
import { chefHint, createHintSync } from '../hints';
import { TICK_MS, addPlayer, createGame, removePlayer, tick, type Controls, type Game } from '../overcooked';
import { clearPot } from '../burn';
import type { ClientMsg } from '@pichi/core';
import { SCHOOL_MAP_ID, SCHOOL_ROWS } from './school-map';
import {
  SCHOOL_TOTAL,
  advance,
  allDone,
  completes,
  focusButton,
  fresh,
  instruction,
  isDone,
  regrantItem,
  skipped,
  wantedItems,
  type Prog,
  type SchoolEvent,
} from './steps';

export const UNWANTED_MS = 1200; // what a chef holds and should not (the dough once the step is done, a tomato at the oven step) goes away after this long
export const REGRANT_MS = 1500; // a chef that put its chopped tomato / its pizza down (and so has empty hands at those steps) gets another one after this long
export const OVEN_SHOW_MS = 900; // what a chef put in an oven stays visible this long, then the oven is empty for the next chef
export const MSG_MIN_MS = 50; // a chef's school message changes at most this often on the wire ...
export const MSG_REFRESH_MS = 1000; // ... and is sent again after this long (a phone that came back is right within a second)

export interface SchoolMember {
  id: number;
  slot: number;
  connected: boolean;
  assist?: boolean;
  known?: boolean;
} // known: the phone already did the school
export interface SchoolRow {
  id: number;
  slot: number;
  step: number;
  done: boolean;
  skipped: boolean;
}
export interface SchoolOpts {
  bus: Emitter<GameEvents>; // the bus the sound and the art listen to (the screen's), so the practice sounds and looks like a match
  send: (m: ClientMsg) => void; // 'hint' and 'school' messages, addressed by playerId
  useKnown?: boolean; // honour `known` when a chef first shows up (the automatic school); false for the one opened by hand: everybody practises
  onAdvance?: (id: number, step: number, skipped: boolean) => void; // a chef finished a step (step = the new one; SCHOOL_TOTAL = done)
}
export interface School {
  readonly game: Game;
  step(dtMs: number, roster: readonly SchoolMember[], consume: (id: number) => Controls): void;
  skip(id: number): void; // this chef already knows: it is done, whatever step it was on
  rows(): SchoolRow[]; // the connected chefs, by slot
  progressOf(id: number): Prog | undefined;
  readonly everyoneDone: boolean; // somebody is connected and all of them are done
  readonly doneMs: number; // how long everyone has been done (0 while not)
  dispose(): void;
}

export function createSchool(o: SchoolOpts): School {
  // built on its own bus: creating the round must not ring the "new order" bell of the real one; the screen's bus takes over right after
  const g = createGame({ mapId: SCHOOL_MAP_ID, difficulty: 'easy', n: 2, rows: SCHOOL_ROWS, countdownMs: 0, magnet: 'strong' }); // the school teaches the controls the lobby gives (Easy: the strong magnet)
  g.bus = o.bus;
  g.params = { ...g.params, roundMs: Infinity, orderEveryMs: Infinity, cookMs: 3000 }; // no clock, no new orders
  g.started = true; // no "round start" event
  const team = g.teams[0]!;
  team.orders = [];
  team.nextOrderAt = Infinity;

  const prog = new Map<number, Prog>();
  const skipLater = new Set<number>(); // a "Saltar" that arrived before the chef was first seen
  const unwanted = new Map<number, number>(); // chef -> game time since its hands hold what does not belong
  const idle = new Map<number, number>(); // chef -> game time since its hands are empty at a step that hands the item back
  const ovens = new Map<number, number>(); // oven index -> game time since it holds something
  let connected: number[] = [];
  let clock = 0,
    acc = 0,
    doneAt: number | null = null,
    everyone = false;
  const hints = createHintSync(o.send as Parameters<typeof createHintSync>[0]);
  const sent = new Map<number, { key: string; at: number }>();

  const finish = (id: number, wasSkipped: boolean, step: number) => o.onAdvance?.(id, step, wasSkipped);
  function onEvent(id: number, ev: SchoolEvent) {
    const pr = prog.get(id),
      p = g.players.get(id);
    if (!pr || !p || isDone(pr) || !completes(pr.step, ev)) return;
    const next = advance(pr);
    prog.set(id, next);
    if (pr.step === 1 && ev.kind === 'chopped') {
      // the chopped tomato goes into the chef's hands, the board is free again
      const s = g.stations[p.chopAt];
      if (s?.kind === 'board') s.item = null;
      p.item = 'cut1';
    }
    if (pr.step === 2) p.item = 'dish'; // the tomato went into the oven and the chef takes the pizza out at once, ready, to deliver it (the oven empties a moment later)
    finish(id, false, next.step);
  }
  const offs = [
    g.bus.on('itemPicked', (e) => onEvent(e.player, { kind: 'picked', item: e.item, from: e.from })),
    g.bus.on('chopDone', (e) => onEvent(e.player, { kind: 'chopped', item: g.stations[e.station]?.item ?? null })),
    g.bus.on('itemDropped', (e) => onEvent(e.player, { kind: 'dropped', item: e.item, at: e.at })),
    g.bus.on('delivered', (e) => onEvent(e.player, { kind: 'delivered' })),
  ];

  function sync(roster: readonly SchoolMember[]) {
    connected = roster.filter((m) => m.connected).map((m) => m.id);
    for (const m of roster) {
      if (!m.connected) {
        if (g.players.has(m.id)) removePlayer(g, m.id);
        continue;
      } // a dropped phone leaves the kitchen, its progress stays for when it is back
      if (!prog.has(m.id)) {
        const early = skipLater.delete(m.id);
        prog.set(m.id, early || (o.useKnown !== false && m.known) ? skipped() : fresh());
        if (early) finish(m.id, true, SCHOOL_TOTAL);
      }
      if (!g.players.has(m.id)) {
        if (m.assist) (g.assist as Set<number>).add(m.id); // Ayudante works in the school like in a match
        addPlayer(g, m.id, m.slot, m.slot);
      }
    }
  }
  function maintain() {
    if (!team.orders.length) team.orders.push({ id: team.orderSeq++, expiresAt: Infinity, warned: true, recipe: 'marinara' }); // the window always has an order to take the pizza
    for (const p of g.players.values()) {
      const pr = prog.get(p.id);
      if (!pr) continue;
      if (p.item && !wantedItems(pr.step).includes(p.item)) {
        const since = unwanted.get(p.id) ?? g.time;
        unwanted.set(p.id, since);
        if (g.time - since >= UNWANTED_MS) {
          p.item = null;
          unwanted.delete(p.id);
        }
      } else unwanted.delete(p.id);
      const give = regrantItem(pr.step);
      if (give && !p.item && !p.cutting) {
        const since = idle.get(p.id) ?? g.time;
        idle.set(p.id, since);
        if (g.time - since >= REGRANT_MS) {
          p.item = give;
          idle.delete(p.id);
        }
      } else idle.delete(p.id);
    }
    g.stations.forEach((s, i) => {
      if (s.kind !== 'pot' || !(s.inputs.length || s.done)) {
        ovens.delete(i);
        return;
      }
      const since = ovens.get(i) ?? g.time;
      ovens.set(i, since);
      if (g.time - since >= OVEN_SHOW_MS) {
        clearPot(s);
        ovens.delete(i);
      }
    });
  }
  function phones(roster: readonly SchoolMember[]) {
    for (const m of roster) {
      if (!m.connected) continue;
      const pr = prog.get(m.id),
        p = g.players.get(m.id);
      const inst = instruction(pr, everyone);
      const msg = {
        t: 'school' as const,
        playerId: m.id,
        step: inst.step,
        total: SCHOOL_TOTAL,
        text: inst.text,
        btn: focusButton(inst.step, p ? chefHint(g, p) : {}),
        ...(inst.done ? { done: true as const } : {}),
      };
      const key = JSON.stringify(msg),
        last = sent.get(m.id);
      if (last && !(key !== last.key && clock - last.at >= MSG_MIN_MS) && clock - last.at < MSG_REFRESH_MS) continue;
      sent.set(m.id, { key, at: clock });
      o.send(msg);
    }
  }

  return {
    game: g,
    step(dtMs, roster, consume) {
      sync(roster);
      clock += dtMs;
      acc += Math.min(dtMs, 100);
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        const controls = new Map<number, Controls>();
        for (const id of g.players.keys()) controls.set(id, consume(id));
        tick(g, controls);
        maintain();
      }
      everyone = allDone(prog, connected);
      doneAt = everyone ? (doneAt ?? clock) : null;
      hints.sync(g, clock);
      phones(roster);
    },
    skip(id) {
      const pr = prog.get(id);
      if (!pr) {
        skipLater.add(id);
        return;
      }
      if (isDone(pr)) return;
      prog.set(id, skipped());
      finish(id, true, SCHOOL_TOTAL);
    },
    rows() {
      return [...g.players.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((p) => {
          const pr = prog.get(p.id) ?? fresh();
          return { id: p.id, slot: p.slot, step: pr.step, done: isDone(pr), skipped: pr.skipped };
        });
    },
    progressOf: (id) => prog.get(id),
    get everyoneDone() {
      return everyone;
    },
    get doneMs() {
      return doneAt === null ? 0 : clock - doneAt;
    },
    dispose() {
      for (const off of offs) off();
      hints.sync(null, clock + MSG_REFRESH_MS); // every phone gets the game's own labels back
    },
  };
}
