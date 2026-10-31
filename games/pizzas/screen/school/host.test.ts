// The Cocina escuela on the screen: when it is offered, how the keys work, what the room remembers and what follows it. The DOM overlay and the scene are fakes; the session is the real one.
import { describe, expect, it } from 'vitest';
import { type GameEvents, Emitter } from '../../sim/round/events';
import { nextPhase, type ClientMsg, type Phase, type PhaseEvent, type PublicPlayer } from '@pichi/core';
import { SCHOOL_MAP_ID, SCHOOL_TOTAL, roomKey } from '../../sim/school/index';
import { ALL_DONE_HOLD_MS, createSchoolHost, type SchoolCtx, type SchoolPlayer } from './host';
import type { SchoolView, ViewModel } from './view';

const info = (id: number, extra: Partial<PublicPlayer> = {}): PublicPlayer => ({
  id,
  name: `P${id}`,
  color: '#fff',
  slot: id - 1,
  connected: true,
  teamId: null,
  ...extra,
});
const player = (id: number, extra: Partial<PublicPlayer> = {}): SchoolPlayer => ({
  info: info(id, extra),
  ctl: { x: 0, y: 0, b: false },
  pendA: 0,
  pendB: 0,
});

function rig(
  o: {
    n?: number;
    infos?: Partial<PublicPlayer>[];
    storage?: SchoolCtx['storage'];
    pizzas?: boolean;
    versus?: boolean;
    busy?: boolean;
    room?: string;
  } = {},
) {
  const players = new Map<number, SchoolPlayer>();
  (o.infos ?? Array.from({ length: o.n ?? 2 }, () => ({}))).forEach((x, i) => players.set(i + 1, player(i + 1, x)));
  const mem = new Map<string, string>();
  const state = {
    phase: 'lobby' as Phase,
    busy: !!o.busy,
    pizzas: o.pizzas ?? true,
    versus: !!o.versus,
    rounds: 0,
    sent: [] as ClientMsg[],
    started: [] as { map: string; view: unknown }[],
    views: [] as ViewModel[],
    shown: 0,
    hidden: 0,
    sfx: [] as string[],
    prepared: 0,
  };
  const view: SchoolView = {
    shown: false,
    show() {
      state.shown++;
    },
    hide() {
      state.hidden++;
    },
    render(m) {
      state.views.push(m);
    },
  };
  const ctx: SchoolCtx = {
    players,
    room: o.room ?? 'ROOM',
    send: (m) => state.sent.push(m),
    bus: new Emitter<GameEvents>(),
    scene: () => ({
      startRound: (_g, map, _seed, v) => {
        state.started.push({ map, view: v });
      },
    }),
    sfx: (id) => state.sfx.push(id),
    phase: () => state.phase,
    dispatch: (ev: PhaseEvent) => {
      state.phase = nextPhase(state.phase, ev);
      if (state.phase === 'school') host.begin();
    }, // what main.ts does: setPhase(school) -> begin()
    transition: (swap) => swap(),
    busy: () => state.busy,
    pizzas: () => state.pizzas,
    versus: () => state.versus,
    prepare: () => {
      state.prepared++;
    },
    continueToRound: () => {
      state.rounds++;
    },
    storage:
      o.storage === undefined
        ? {
            getItem: (k) => mem.get(k) ?? null,
            setItem: (k, v) => {
              mem.set(k, v);
            },
          }
        : o.storage,
    makeView: () => view,
  };
  const host = createSchoolHost(ctx);
  const frames = (ms: number) => {
    for (let t = 0; t < ms; t += 16) host.step(16);
  };
  return { host, ctx, state, players, mem, frames };
}

describe('when "A cocinar" offers the school', () => {
  it('the first time of a room with players who have not done it: it takes over (phase school, the school map, no clock or score in the view)', () => {
    const r = rig();
    expect(r.host.offer()).toBe(true);
    expect(r.state.phase).toBe('school');
    expect(r.state.started).toHaveLength(1);
    expect(r.state.started[0]!.map).toBe(SCHOOL_MAP_ID);
    expect(r.state.started[0]!.view).toEqual({ teams: null, hiddenScore: false, school: true });
    expect(r.state.prepared).toBe(1);
    expect(r.host.debug().origin).toBe('start');
  });
  it('not in the other game, not while the iris or the how-to card is up, not with nobody connected', () => {
    for (const o of [{ pizzas: false }, { busy: true }, { infos: [{ connected: false }] }]) {
      const r = rig(o);
      expect(r.host.offer(), JSON.stringify(o)).toBe(false);
      expect(r.state.phase).toBe('lobby');
    }
  });
  it('not when every connected phone already did it (the relay flagged them)', () => {
    expect(rig({ infos: [{ school: true }, { school: true }] }).host.offer()).toBe(false);
    expect(rig({ infos: [{ school: true }, {}] }).host.offer()).toBe(true);
    expect(rig({ infos: [{ school: true }, { connected: false }] }).host.offer(), 'a phone that is gone does not count').toBe(false);
  });
  it('versus lobby: the school runs all together (one cooperative kitchen) and says so', () => {
    const r = rig({ versus: true });
    expect(r.host.offer()).toBe(true);
    expect(r.state.views.at(-1)!.sub).toMatch(/Equipos juntos, sin competir/);
    expect(rig().host.offer() && true).toBe(true);
    const c = rig();
    c.host.offer();
    expect(c.state.views.at(-1)!.sub).toMatch(/Sin tiempo ni puntos/);
  });
});

describe('what the room remembers', () => {
  const everybodySkips = (r: ReturnType<typeof rig>) => {
    for (const id of r.players.keys()) r.host.skip(id);
    r.frames(ALL_DONE_HOLD_MS + 200);
  };
  it('when everybody finishes the school ends by itself after the "todos listos" beat, and the room does not offer it again', () => {
    const r = rig();
    r.host.offer();
    everybodySkips(r);
    expect(r.state.phase).toBe('lobby');
    expect(r.host.debug().on).toBe(false);
    expect(r.mem.get(roomKey('ROOM'))).toBe('1');
    expect(r.host.offer()).toBe(false);
    expect(r.state.sfx, 'the fanfare of "todos listos" rang once').toContain('fanfare');
    expect(r.state.hidden).toBeGreaterThan(0);
  });
  it('"todos listos" stays on screen for about two seconds before it ends (a beat to cheer, not a flash)', () => {
    const r = rig();
    r.host.offer();
    for (const id of r.players.keys()) r.host.skip(id);
    r.frames(1500);
    expect(r.host.debug().on, 'still showing it').toBe(true);
    expect(r.state.views.at(-1)!.allDone).toBe(true);
    r.frames(1400);
    expect(r.host.debug().on).toBe(false);
  });
  it('Enter skips it for everybody at once, and that counts as done for the session too', () => {
    const r = rig();
    r.host.offer();
    r.frames(500);
    expect(r.host.key('Enter', false)).toBe(true);
    expect(r.state.phase).toBe('lobby');
    expect(r.host.offer()).toBe(false);
    expect(r.mem.get(roomKey('ROOM'))).toBe('1');
  });
  it('another room (another code) is a new session: the school is offered again', () => {
    const shared = new Map<string, string>();
    const storage = {
      getItem: (k: string) => shared.get(k) ?? null,
      setItem: (k: string, v: string) => {
        shared.set(k, v);
      },
    };
    const a = rig({ room: 'AAAA', storage });
    a.host.offer();
    a.host.key('Enter', false);
    expect(rig({ room: 'AAAA', storage }).host.offer(), 'same room, same session').toBe(false);
    expect(rig({ room: 'BBBB', storage }).host.offer(), 'another room').toBe(true);
  });
  it('with blocked storage it still remembers for the life of the page', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    const r = rig({ storage: throwing });
    expect(r.host.offer()).toBe(true);
    r.host.key('Enter', false);
    expect(r.host.offer()).toBe(false);
  });
  it('with no storage object at all (private mode) the same', () => {
    const r = rig({ storage: null });
    r.host.offer();
    r.host.key('Escape', false);
    expect(r.host.offer()).toBe(false);
  });
});

describe('what follows the school', () => {
  it('offered by "A cocinar": the round goes on (the how-to card, then the countdown) once it ends', () => {
    const r = rig();
    r.host.offer();
    r.host.key('Enter', false);
    expect(r.state.rounds).toBe(1);
    expect(r.state.phase).toBe('lobby');
  });
  it('opened by hand (P, or the button): back to the lobby, the host starts the round when ready', () => {
    const r = rig();
    expect(r.host.key('p', false)).toBe(true);
    expect(r.state.phase).toBe('school');
    expect(r.host.debug().origin).toBe('lobby');
    r.host.key('Enter', false);
    expect(r.state.phase).toBe('lobby');
    expect(r.state.rounds).toBe(0);
  });
  it('by hand it works again and again, whatever the room remembers', () => {
    const r = rig();
    r.host.offer();
    r.host.key('Enter', false);
    expect(r.host.open()).toBe(true);
    expect(r.state.phase).toBe('school');
  });
  it('a school opened by hand ignores what the phones remember: everybody starts at step 0; the one offered at the start honours it', () => {
    const manual = rig({ infos: [{ school: true }, {}] });
    manual.host.open();
    manual.frames(100);
    expect(manual.host.debug().rows.map((x) => x.step)).toEqual([0, 0]);
    const auto = rig({ infos: [{ school: true }, {}] });
    auto.host.offer();
    auto.frames(100);
    expect(auto.host.debug().rows.map((x) => [x.step, x.skipped])).toEqual([
      [SCHOOL_TOTAL, true],
      [0, false],
    ]);
  });
});

describe('the keys', () => {
  it("while it runs every key is the school's (nothing else moves), but only Enter and Escape end it, and a held key does not", () => {
    const r = rig();
    r.host.offer();
    for (const k of ['ArrowLeft', 'h', 'e', 'x']) expect(r.host.key(k, false), k).toBe(true);
    expect(r.state.phase).toBe('school');
    r.host.key('Enter', true);
    expect(r.state.phase).toBe('school');
    r.host.key('Escape', false);
    expect(r.state.phase).toBe('lobby');
  });
  it('the iris moving swallows Enter (no double end)', () => {
    const r = rig();
    r.host.offer();
    r.state.busy = true;
    expect(r.host.key('Enter', false)).toBe(true);
    expect(r.state.phase).toBe('school');
  });
  it('P in the lobby opens it; in any other phase or game, or with the iris moving, it does nothing', () => {
    expect(rig({ pizzas: false }).host.key('p', false)).toBe(false);
    expect(rig({ busy: true }).host.key('P', false)).toBe(false);
    const held = rig();
    expect(held.host.key('p', true), 'a held key').toBe(false);
    expect(held.state.phase).toBe('lobby');
    const r = rig();
    r.state.phase = 'results';
    expect(r.host.key('p', false)).toBe(false);
    expect(rig().host.key('Enter', false), "Enter in the lobby is not the school's").toBe(false);
  });
});

describe('the phones during the school', () => {
  it('each frame tells every connected phone its step; a phone that pressed "Saltar" is done on the TV at once', () => {
    const r = rig({ n: 3 });
    r.host.offer();
    r.frames(200);
    const msgs = r.state.sent.filter((m) => m.t === 'school');
    expect(new Set(msgs.map((m) => (m as { playerId: number }).playerId))).toEqual(new Set([1, 2, 3]));
    r.host.skip(2);
    expect(r.host.debug().rows.find((x) => x.id === 2)).toMatchObject({ done: true, skipped: true });
    expect(r.host.debug().rows.find((x) => x.id === 1)).toMatchObject({ done: false });
    expect(r.state.views.at(-1)!.chips.map((c) => c.name)).toEqual(['P1', 'P2', 'P3']);
  });
  it('a skip with no school running is ignored', () => {
    const r = rig();
    expect(() => r.host.skip(1)).not.toThrow();
  });
  it('the presses a phone sent before the school started are not carried into it', () => {
    const r = rig({ n: 1 });
    r.players.get(1)!.pendA = 5;
    r.players.get(1)!.pendB = 3;
    r.host.offer();
    expect(r.players.get(1)!.pendA).toBe(0);
    expect(r.players.get(1)!.pendB).toBe(0);
  });
});
