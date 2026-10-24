import { describe, expect, it } from 'vitest';
import { LEGACY_CATALOG, applyResult, fullMask, levelById, progressOf } from '@party/shared/obstaculos/campaign';
import { LAST_KEY } from './api';
import { CampaignFlow, joinNames } from './flow';
import { FakeApi, MemKV } from './testkit';

const mk = (room = 'MAIN') => {
  const api = new FakeApi(), kv = new MemKV();
  let t = 5000;
  const flow = new CampaignFlow({ api, catalog: LEGACY_CATALOG, room, kv, now: () => ++t });
  return { api, kv, flow, other: (r: string) => new CampaignFlow({ api, catalog: LEGACY_CATALOG, room: r, kv: new MemKV(), now: () => ++t }) };
};
const clear = { cleared: true, timeMs: 8000, collectiblesMask: 0, deaths: 0 };
const fail = { cleared: false, timeMs: 30_000, collectiblesMask: 0, deaths: 12 };

describe('names', () => {
  it('joins the group like people say it', () => {
    expect(joinNames([])).toBe('Expedición');
    expect(joinNames(['Nico'])).toBe('Nico');
    expect(joinNames(['Nico', 'Angi'])).toBe('Nico y Angi');
    expect(joinNames(['Nico', 'Angi', 'Pablo'])).toBe('Nico, Angi y Pablo');
    expect(joinNames(['Nico', 'Angi', 'Pablo', 'Mati', 'Coni'])).toBe('Nico, Angi y 3 más');
  });
});

describe('the hub: who is there to continue', () => {
  it('offers the remembered expedition; the most recent one when nothing is remembered; nothing when the server is down', async () => {
    const { api, kv, flow } = mk();
    expect((await flow.hub()).last).toBeNull();
    const a = await api.create('A'); await api.merge({ ...a!, updatedAt: 2000 });
    const b = await api.create('B'); await api.merge({ ...b!, updatedAt: 3000 });
    expect((await flow.hub()).last?.name).toBe('B'); // nothing remembered: the most recent
    kv.setItem(LAST_KEY, a!.id);
    expect((await flow.hub()).last?.name).toBe('A'); // the remembered one wins even if it is older
    kv.setItem(LAST_KEY, 'exp-gone0001');
    expect((await flow.hub()).last?.name).toBe('B');
    expect(kv.getItem(LAST_KEY)).toBeNull(); // a remembered id the server does not know is forgotten
    api.down = true;
    expect(await flow.hub()).toEqual({ list: [], last: null, offline: true });
  });
});

describe('opening, creating and leaving', () => {
  it('create names the group, opens it, remembers it and claims it for this room', async () => {
    const { api, kv, flow } = mk('SALA');
    expect(await flow.create(['Nico', 'Angi'])).toEqual({ ok: true });
    expect(flow.exp?.name).toBe('Nico y Angi');
    expect(kv.getItem(LAST_KEY)).toBe(flow.exp!.id);
    expect(api.claims.get(flow.exp!.id)).toBe('SALA');
    await flow.leave();
    expect(api.claims.size).toBe(0);
    expect(flow.exp).toBeNull();
  });
  it('"ya sabemos escalar" saves the Bosque as open', async () => {
    const { api, flow } = mk();
    await flow.create(['A', 'B'], ['2']);
    expect(api.store.get(flow.exp!.id)!.unlocked).toEqual(['world:2']);
    expect(flow.spec('2-1', 2)).toMatchObject({ level: { id: '2-1' } });
  });
  it('another room cannot open an expedition that is being played', async () => {
    const { flow, other } = mk('A');
    await flow.create(['A', 'B']);
    const r = await other('B').open(flow.exp!.id);
    expect(r).toEqual({ ok: false, reason: 'Esa expedición está jugando en la sala A' });
  });
  it('a server that is down refuses with words instead of throwing', async () => {
    const { api, flow } = mk();
    api.down = true;
    expect(await flow.create(['A'])).toEqual({ ok: false, reason: 'No se pudo crear la expedición' });
    expect(await flow.open('exp-whatever1')).toEqual({ ok: false, reason: 'No se pudo abrir la expedición' });
  });
  it('reset removes it and forgets the remembered id', async () => {
    const { api, kv, flow } = mk();
    await flow.create(['A', 'B']);
    const id = flow.exp!.id;
    expect(await flow.reset(id)).toBe(true);
    expect(api.store.has(id)).toBe(false);
    expect(kv.getItem(LAST_KEY)).toBeNull();
    expect(flow.exp).toBeNull();
  });
});

describe('what a level asks and what it gives back', () => {
  it('spec refuses a closed level and one not validated for this many players, and hands the level its own tilemap and mode', async () => {
    const { flow } = mk();
    await flow.create(['A', 'B']);
    expect(flow.spec('1-2', 2)).toEqual({ ok: false, reason: 'Todavía está cerrado' });
    const s = flow.spec('1-1', 2);
    expect('ok' in s).toBe(false);
    expect(s).toMatchObject({ mode: 'free', level: { id: '1-1' } });
    expect(flow.spec('1-1', 9)).toEqual({ ok: false, reason: 'Este nivel no está validado para 9 jugadores' });
    expect(flow.spec('nope', 2)).toEqual({ ok: false, reason: 'Nivel desconocido' });
  });
  it('a clear is saved on the server at once and offers Siguiente', async () => {
    const { api, flow } = mk();
    await flow.create(['A', 'B']);
    flow.begin('1-1');
    await flow.levelEnd({ ...clear, collectiblesMask: fullMask(levelById(LEGACY_CATALOG, '1-1')!.collectibles) });
    const o = flow.outcome!;
    expect(o).toMatchObject({ levelId: '1-1', cleared: true, saved: true, next: { id: '1-2' } });
    expect(o.after.stars).toEqual([true, true, true]); // every collectible taken, no hearts lost
    expect(api.store.get(flow.exp!.id)!.levels['1-1']!.done).toBe(true);
    expect(flow.continueAt()?.id).toBe('1-2');
  });
  it('hearts lost on a failed attempt count against star 3 of the clear that follows', async () => {
    const { flow } = mk();
    await flow.create(['A', 'B']);
    flow.begin('1-1');
    await flow.levelEnd(fail); // first attempt: out of hearts, the session retries
    await flow.levelEnd(clear); // second attempt clears with no deaths of its own
    expect(flow.outcome!.deaths).toBe(12);
    expect(flow.outcome!.after.stars).toEqual([true, false, false]);
  });
  it('game overs add up; after five the skip is offered, and skipping opens the next level without stars', async () => {
    const { flow } = mk();
    await flow.create(['A', 'B']);
    for (let i = 1; i <= 5; i++) {
      flow.begin('1-1');
      await flow.levelEnd(fail); await flow.levelEnd(fail);
      flow.failed();
      expect(flow.outcome).toMatchObject({ cleared: false, failuresInARow: i, canSkip: i >= 5 });
    }
    expect(await flow.skip('1-1')).toBe(true);
    expect(progressOf(flow.exp!, '1-1')).toMatchObject({ skipped: true, done: false });
    expect(flow.continueAt()?.id).toBe('1-2');
    expect(flow.failures.get('1-1')).toBeUndefined();
  });
  it('a clear after failures resets the streak', async () => {
    const { flow } = mk();
    await flow.create(['A', 'B']);
    flow.begin('1-1'); await flow.levelEnd(fail); await flow.levelEnd(fail); flow.failed();
    expect(flow.failures.get('1-1')).toBe(1);
    flow.begin('1-1'); await flow.levelEnd(clear);
    expect(flow.failures.has('1-1')).toBe(false);
  });
  it('a failed session saves nothing', async () => {
    const { api, flow } = mk();
    await flow.create(['A', 'B']);
    const before = api.merges;
    flow.begin('1-1'); await flow.levelEnd(fail); await flow.levelEnd(fail); flow.failed();
    expect(api.merges).toBe(before);
  });
  it('with the server down the clear stays in memory, says so, and goes up with the next save', async () => {
    const { api, flow } = mk();
    await flow.create(['A', 'B']);
    const id = flow.exp!.id;
    api.down = true;
    flow.begin('1-1'); await flow.levelEnd(clear);
    expect(flow.outcome!.saved).toBe(false);
    expect(progressOf(flow.exp!, '1-1').done).toBe(true); // the group can keep playing
    expect(api.store.get(id)!.levels['1-1']).toBeUndefined();
    api.down = false;
    flow.begin('1-2'); await flow.levelEnd(clear);
    expect(flow.outcome!.saved).toBe(true);
    expect(Object.keys(api.store.get(id)!.levels).sort()).toEqual(['1-1', '1-2']); // the whole expedition travels, so nothing was lost
  });
  it('a stale screen cannot lower the server: the merge keeps the best of both', async () => {
    const { api, flow } = mk('A');
    await flow.create(['A', 'B']);
    const id = flow.exp!.id;
    // someone else (another screen, earlier) already beat 1-1 with 3 stars on the server
    const server = api.store.get(id)!;
    api.store.set(id, applyResult(server, LEGACY_CATALOG, { levelId: '1-1', cleared: true, timeMs: 5000, collectiblesMask: fullMask(levelById(LEGACY_CATALOG, '1-1')!.collectibles), deaths: 0 }, 9000));
    flow.begin('1-1'); await flow.levelEnd({ ...clear, deaths: 5, timeMs: 9000 });
    expect(progressOf(flow.exp!, '1-1')).toMatchObject({ stars: [true, true, true], bestTimeMs: 5000 });
  });
});
