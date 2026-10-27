import { defaultAppearance, encodeAppearance, type Appearance, type ClientMsg, type ServerMsg } from '@pichi/core';
import { mulberry32 } from '@pichi/core/rng';
import { describe, expect, it } from 'vitest';
import { AP_KEY, createCreator, loadSaved, type Kv } from './creator';
import type { Flow } from './flow';
import type { Clock } from './throttle';
import type { Actions } from './view';

function rig(saved?: Appearance) {
  const mem = new Map<string, string>(saved ? [[AP_KEY, JSON.stringify(saved)]] : []);
  const store: Kv = { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) };
  const sent: ClientMsg[] = [];
  const cues: string[] = [];
  const shown: { f: Flow; dup: string | null; open: boolean; preview: boolean; edit: boolean }[] = [];
  let act!: Actions;
  let t = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const clock: Clock = { now: () => t, setTimeout: (fn, ms) => timers.push({ at: t + ms, fn }), clearTimeout: () => timers.splice(0) };
  const tick = (ms: number) => {
    t += ms;
    for (const x of timers.splice(0)) x.at <= t ? x.fn() : timers.push(x);
  };
  let last = { open: false, preview: false, edit: false };
  const c = createCreator({
    send: (m) => sent.push(m),
    store,
    clock,
    rng: mulberry32(1),
    cue: (x) => cues.push(x),
    ui: (a) => {
      act = a;
      return { render: (f, dup) => shown.push({ f, dup, ...last }), show: (open, preview, edit) => void (last = { open, preview, edit }) };
    },
  });
  const rx = (m: object) => c.onMessage(m as ServerMsg);
  const joined = (id = 1) => rx({ t: 'joined', player: { id, name: 'Nico', color: '#2F7DE1', slot: 0 }, room: 'main', v: 1 });
  return { c, act: () => act, sent, cues, store, mem, tick, rx, joined, ui: () => last, shown };
}
const apMsgs = (sent: ClientMsg[]) => sent.filter((m): m is Extract<ClientMsg, { t: 'appearance' }> => m.t === 'appearance');

describe('creator shell', () => {
  it('first visit: the join carries a random look, the creator is open and the preview runs', () => {
    const r = rig();
    r.c.begin();
    const ap = r.c.joinExtra().ap;
    expect(ap).toBeDefined();
    expect(r.c.flow.screen).toBe('creator');
    expect(r.ui()).toMatchObject({ open: true, preview: true });
    expect(r.cues).toContain('soft'); // the creator appearing is looked at
  });
  it('with a saved look: asks first, and Jugar así sends done without opening the creator', () => {
    const saved = defaultAppearance(5);
    const r = rig(saved);
    r.c.begin();
    expect(r.c.flow.screen).toBe('confirm');
    expect(r.c.joinExtra().ap).toEqual(saved);
    r.act().play();
    expect(apMsgs(r.sent)).toEqual([{ t: 'appearance', ap: saved, done: true }]);
    expect(r.ui().open).toBe(false);
  });
  it('live changes are throttled to one per 300 ms and Listo saves, sends done at once and closes', () => {
    const r = rig();
    r.c.begin();
    r.act().pick('hat', 1);
    r.act().pick('hat', 2);
    r.act().pick('hat', 3);
    expect(apMsgs(r.sent).map((m) => m.ap.hat)).toEqual([1]);
    r.tick(300);
    expect(apMsgs(r.sent).map((m) => m.ap.hat)).toEqual([1, 3]);
    r.act().pick('gl', 2);
    r.act().done();
    const last = apMsgs(r.sent).at(-1)!;
    expect([last.done, last.ap.hat, last.ap.gl]).toEqual([true, 3, 2]);
    expect(loadSaved({ get: (k) => r.mem.get(k) ?? null, set: () => {} })).toEqual(r.c.flow.ap);
    r.tick(1000);
    expect(apMsgs(r.sent).at(-1)!.done).toBe(true); // the waiting live message was dropped
    expect(r.cues).toContain('done');
  });
  it('a twin in the roster raises the "Igual que X" notice and a cue, once; a different look clears it', () => {
    const r = rig();
    r.c.begin();
    r.joined(1);
    const mine = r.c.flow.ap;
    r.rx({ t: 'state', players: [{ id: 2, name: 'Ana', color: '#fff', slot: 1, connected: true, teamId: null, ap: mine }] });
    expect(r.shown.at(-1)!.dup).toBe('Ana');
    const soft = r.cues.filter((c) => c === 'soft').length;
    r.rx({ t: 'appearance', playerId: 2, ap: mine, customizing: false });
    expect(r.cues.filter((c) => c === 'soft').length).toBe(soft); // same notice: no second cue
    r.act().pick('bk', (mine.bk + 1) % 6);
    expect(r.shown.at(-1)!.dup).toBeNull();
    r.rx({ t: 'player_removed', playerId: 2 });
    expect(r.shown.at(-1)!.dup).toBeNull();
  });
  it('Aleatorio avoids the roster and keeps the chosen gender', () => {
    const r = rig();
    r.c.begin();
    r.joined(1);
    const others = Array.from({ length: 6 }, (_, i) => ({
      id: i + 2,
      name: `P${i}`,
      color: '#fff',
      slot: i,
      connected: true,
      teamId: null,
      ap: defaultAppearance(i + 20),
    }));
    r.rx({ t: 'state', players: others });
    r.act().pick('g', 0);
    for (let i = 0; i < 20; i++) {
      r.act().random();
      expect(r.c.flow.ap.g).toBe(0);
      expect(encodeAppearance(r.c.flow.ap)).not.toBe('');
    }
  });
  it('Editar personaje: only in the lobby, only with the creator closed', () => {
    const r = rig();
    r.c.begin();
    r.act().done();
    r.joined(1);
    r.rx({ t: 'phase', phase: 'results' });
    expect(r.ui().edit).toBe(false);
    r.act().edit();
    expect(r.c.flow.screen).toBe('closed'); // results: no button, and a stray press does nothing
    r.rx({ t: 'phase', phase: 'lobby' });
    expect(r.ui().edit).toBe(true);
    r.act().edit();
    expect(r.c.flow.screen).toBe('creator');
    expect(r.ui().edit).toBe(false);
  });
  it('the host starting a match closes the creator and keeps the look (sabotage target: the phase guard)', () => {
    const r = rig();
    r.c.begin();
    r.joined(1);
    r.rx({ t: 'phase', phase: 'lobby' });
    r.act().pick('hat', 4);
    r.rx({ t: 'phase', phase: 'playing' });
    expect(r.c.flow.screen).toBe('closed');
    expect(loadSaved({ get: (k) => r.mem.get(k) ?? null, set: () => {} })?.hat).toBe(4);
    r.tick(1000);
    expect(apMsgs(r.sent).filter((m) => m.ap.hat === 4).length).toBeLessThanOrEqual(1); // nothing is sent into a phase that refuses it
  });
  it('a reconnect while creating keeps the creator open; a reopened page with a saved look tells the relay it is done', () => {
    const r = rig();
    r.c.begin();
    r.act().pick('hat', 2);
    expect(r.c.joinExtra().ap).toMatchObject({ hat: 2 });
    const saved = defaultAppearance(9);
    const q = rig(saved); // page reopened: no begin()
    expect(q.c.joinExtra().ap).toEqual(saved);
    q.joined(1);
    expect(apMsgs(q.sent)).toEqual([{ t: 'appearance', ap: saved, done: true }]);
    expect(rig().c.joinExtra()).toEqual({}); // nothing saved, nothing to say: the relay keeps its default
  });
  it('a corrupt saved look is ignored', () => {
    const bad = { get: () => '{"v":2,"g":"x"', set: () => {} };
    expect(loadSaved(bad)).toBeNull();
    expect(loadSaved({ get: () => '[1,2]', set: () => {} })).toBeNull();
  });
});
