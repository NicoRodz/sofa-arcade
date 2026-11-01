// The Cocina escuela on the big screen: the glue between the pure session (shared/tutorial) and the page. It owns the session, the TV overlay, the keys of the school and the
// memory of the room; main.ts only forwards a few hooks (offer, begin, step, key, skip) and hands over what the school needs to talk to the rest of the screen.
import type { ClientMsg, Phase, PhaseEvent, PublicPlayer } from '@pichi/core';
import type { GameEvents, Emitter } from '../../sim/round/events';
import type { Controls, Game } from '../../sim/overcooked';
import {
  SCHOOL_MAP_ID,
  SCHOOL_SUB,
  SCHOOL_SUB_VERSUS,
  SCHOOL_TOTAL,
  createSchool,
  kvOf,
  markDone,
  readDone,
  roomKey,
  shouldOffer,
  type KV,
  type School,
  type SchoolMember,
} from '../../sim/school/index';
import type { RoundView } from '../art/hud/hud';
import { chefOf } from '@pichi/screen-kit/art';
import type { SfxId } from '@pichi/screen-kit/audio';
import { createSchoolView, type SchoolView } from './view';

export const ALL_DONE_HOLD_MS = 2400; // "todos listos" stays this long, then the school ends by itself
export type Origin = 'start' | 'lobby'; // start: "A cocinar" offered it before the first match (the round goes on after); lobby: opened by hand (back to the lobby after)

/** What a player of the screen looks like to the school: its public info and the latest input (the same object main.ts keeps per phone). */
export interface SchoolPlayer {
  info: PublicPlayer;
  ctl: { x: number; y: number; b: boolean };
  pendA: number;
  pendB: number;
}
export interface SchoolCtx {
  players: Map<number, SchoolPlayer>;
  room: string;
  send: (m: ClientMsg) => void;
  bus: Emitter<GameEvents>;
  scene: () => { startRound(g: Game, mapId: string, seed: number, view?: RoundView): void };
  sfx: (id: SfxId) => void;
  phase: () => Phase;
  dispatch: (ev: PhaseEvent) => void;
  transition: (swap: () => void) => void; // the iris
  busy: () => boolean; // the iris is moving or a how-to card is open: the school does not start now
  pizzas: () => boolean; // the pizza game is the one in the lobby
  versus: () => boolean;
  prepare: () => void; // the screen forgets the stations and the scene of the last round
  continueToRound: () => void; // after a school offered by "A cocinar": go on with the round (the how-to card, then the countdown)
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null; // default: sessionStorage (the room's memory lives as long as the tab)
  makeView?: () => SchoolView; // default: the DOM overlay (a test passes a fake)
}

export function createSchoolHost(ctx: SchoolCtx) {
  const idle: Controls = { x: 0, y: 0, a: 0, b: false };
  let kv: KV | null = null;
  try {
    kv = kvOf(ctx.storage === undefined ? sessionStorage : ctx.storage);
  } catch {
    kv = null;
  } // sessionStorage can throw when blocked
  let doneHere = false; // memory for a page whose storage is blocked
  let session: School | null = null;
  let origin: Origin = 'lobby';
  let pending: Origin | null = null; // chosen before the iris closes; begin() reads it
  let view: SchoolView | null = null;
  let ending = false,
    cheered = false; // cheered: the fanfare of "todos listos" already rang

  const sessionDone = () => doneHere || readDone(kv, roomKey(ctx.room));
  const connected = () => [...ctx.players.values()].filter((p) => p.info.connected).map((p) => p.info);
  const roster = (): SchoolMember[] =>
    [...ctx.players.values()].map((p) => ({
      id: p.info.id,
      slot: p.info.slot,
      connected: p.info.connected,
      ...(p.info.school ? { known: true } : {}),
      ...(p.info.assist ? { assist: true } : {}),
    }));
  const consume = (id: number): Controls => {
    const p = ctx.players.get(id);
    if (!p) return idle;
    const c: Controls = { x: p.ctl.x, y: p.ctl.y, b: p.ctl.b, a: p.pendA, bTaps: p.pendB };
    p.pendA = 0;
    p.pendB = 0;
    return c;
  };
  const start = (from: Origin) => {
    if (ctx.phase() !== 'lobby' || ctx.busy() || !ctx.pizzas()) return false;
    pending = from;
    ctx.transition(() => ctx.dispatch('practice'));
    return true;
  };
  const model = () => {
    const s = session!;
    return {
      sub: ctx.versus() ? SCHOOL_SUB_VERSUS : SCHOOL_SUB,
      chips: s.rows().map((r) => ({
        slot: r.slot,
        name: ctx.players.get(r.id)?.info.name ?? chefOf(r.slot).name,
        step: r.step,
        done: r.done,
        skipped: r.skipped,
      })),
      allDone: s.everyoneDone,
      hint: '<kbd>Enter</kbd> saltar para todos',
    };
  };
  function stop() {
    session?.dispose();
    session = null;
    ending = false;
    cheered = false;
    pending = null;
    view?.hide();
  }
  function end() {
    if (!session || ending) return;
    ending = true;
    doneHere = true;
    markDone(kv, roomKey(ctx.room)); // finished or skipped, the room does not repeat it this session
    ctx.transition(() => {
      const from = origin;
      stop();
      ctx.dispatch('endPractice');
      if (from === 'start') ctx.continueToRound();
    });
  }

  if (typeof document !== 'undefined')
    document.getElementById('schoolbtn')?.addEventListener('click', () => {
      start('lobby');
    }); // the lobby's "P · Cocina escuela" button

  return {
    /** "A cocinar" was pressed: true when the school takes over (first time of the room, someone has not done it). */
    offer: (): boolean => shouldOffer({ pizzas: ctx.pizzas(), sessionDone: sessionDone(), connected: connected() }) && start('start'),
    /** Opened by hand from the lobby (P, or its button): everybody practises, whatever the phones remember. */
    open: (): boolean => start('lobby'),
    /** The phase just became 'school': build the session and show it. */
    begin() {
      origin = pending ?? 'lobby';
      pending = null;
      ending = false;
      for (const p of ctx.players.values()) {
        p.pendA = 0;
        p.pendB = 0;
      }
      ctx.prepare();
      session?.dispose();
      session = createSchool({
        bus: ctx.bus,
        send: ctx.send,
        useKnown: origin === 'start',
        onAdvance: (_id, step) => {
          if (step < SCHOOL_TOTAL) ctx.sfx('navPick');
        },
      });
      ctx.scene().startRound(session.game, SCHOOL_MAP_ID, 1, { teams: null, hiddenScore: false, school: true });
      view ??= (ctx.makeView ?? createSchoolView)();
      view.show();
      view.render(model());
    },
    /** Every frame the screen is in the school. */
    step(deltaMs: number) {
      if (!session || ctx.phase() !== 'school') return;
      session.step(deltaMs, roster(), consume);
      view?.render(model());
      if (session.everyoneDone && !cheered) {
        cheered = true;
        ctx.sfx('fanfare');
      }
      if (!session.everyoneDone) cheered = false;
      if (session.everyoneDone && session.doneMs >= ALL_DONE_HOLD_MS) end();
    },
    /** A key (or the Captain's D-pad). True when the school used it. */
    key(key: string, repeat: boolean): boolean {
      if (ctx.phase() === 'school') {
        if ((key === 'Enter' || key === 'Escape') && !repeat && !ctx.busy()) end();
        return true; // nothing else moves while the school runs
      }
      if (ctx.phase() === 'lobby' && (key === 'p' || key === 'P') && !repeat) return start('lobby');
      return false;
    },
    /** A phone pressed "Saltar": that chef is done. */
    skip: (id: number) => {
      session?.skip(id);
    },
    /** For the capture tool and the end-to-end checks: what the school believes. */
    debug: () => {
      const g = session?.game;
      return {
        on: !!session,
        origin,
        ending,
        everyoneDone: !!session?.everyoneDone,
        rows: session?.rows() ?? [],
        done: sessionDone(),
        players: g
          ? [...g.players.values()].map((p) => ({
              id: p.id,
              slot: p.slot,
              x: p.x,
              y: p.y,
              fx: p.fx,
              fy: p.fy,
              item: p.item,
              cutting: p.cutting,
              assist: !!p.assist,
            }))
          : [],
        stations: g ? g.stations.map((s) => ({ item: s.item, inputs: s.inputs, done: s.done })) : [],
      };
    },
  };
}
