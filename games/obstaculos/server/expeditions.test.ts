// The campaign's saved progress on disk: one JSON per expedition, atomic writes, .bak, trash, claims and the HTTP API (plan §6, A0).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_CATALOG, applyResult, continueLevel, parseExpedition, type Expedition } from '../campaign/index';
import { ExpeditionError, ExpeditionStore, type StepName } from './expeditions';
import { startServer } from '../../../apps/server/src/server';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'pg-exp-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const clear = (e: Expedition, levelId: string, now: number) =>
  applyResult(e, CAMPAIGN_CATALOG, { levelId, cleared: true, timeMs: 5000, collectiblesMask: 0, deaths: 0 }, now);
const onDisk = (id: string) => parseExpedition(JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8')));
const STEPS: StepName[] = ['write-tmp', 'copy-bak', 'rename-bak', 'rename'];

describe('the store', () => {
  it('creates an expedition as a JSON file and reads it back', () => {
    const s = new ExpeditionStore({ dir, now: () => 42 });
    const e = s.create('  Nico   y Angi ');
    expect(e).toMatchObject({ name: 'Nico y Angi', createdAt: 42, schemaVersion: 1, lastLevelId: null });
    expect(onDisk(e.id)).toEqual(e);
    expect(s.get(e.id)).toEqual(e);
    expect(s.list().map((x) => x.id)).toEqual([e.id]);
  });
  it('an empty name becomes a default one', () => {
    expect(new ExpeditionStore({ dir }).create('   ').name).toBe('Expedición');
  });
  it('merging stores the union and never lowers what is on disk', () => {
    const s = new ExpeditionStore({ dir });
    const e0 = s.create('A');
    const e1 = clear(clear(e0, '1-1', 100), '1-2', 101);
    s.merge(e0.id, e1);
    const stale = s.merge(e0.id, e0); // an old screen sends the empty expedition
    expect(Object.keys(stale.levels).sort()).toEqual(['1-1', '1-2']);
    expect(onDisk(e0.id)!.levels['1-2']!.done).toBe(true);
  });
  it('refuses an invalid body, a body for another id, an unknown id and a hostile id', () => {
    const s = new ExpeditionStore({ dir });
    const e = s.create('A');
    expect(() => s.merge(e.id, { nope: 1 })).toThrow(ExpeditionError);
    expect(() => s.merge(e.id, { ...e, id: 'exp-other001' })).toThrow(ExpeditionError);
    expect(() => s.merge('exp-missing1', e)).toThrow(ExpeditionError);
    expect(() => s.get('../../etc/passwd')).toThrow(ExpeditionError);
    expect(() => s.trash('..')).toThrow(ExpeditionError);
    expect(onDisk(e.id)).toEqual(e);
  });
  it('keeps the previous version as .bak and falls back to it when the main file is unreadable', () => {
    const s = new ExpeditionStore({ dir });
    const e0 = s.create('A');
    const e1 = clear(e0, '1-1', 100);
    s.merge(e0.id, e1);
    expect(parseExpedition(JSON.parse(readFileSync(path.join(dir, `${e0.id}.json.bak`), 'utf8')))).toEqual(e0);
    writeFileSync(path.join(dir, `${e0.id}.json`), '{"half'); // the disk ate the main file
    expect(s.get(e0.id)).toEqual(e0);
    expect(new ExpeditionStore({ dir }).get(e0.id)).toEqual(e0);
    expect(onDisk(e0.id)).toEqual(e0); // recover() on start rewrote it from the .bak
  });
  it('a leftover .tmp from a dead write is deleted on start and never read', () => {
    const s = new ExpeditionStore({ dir });
    const e = s.create('A');
    writeFileSync(path.join(dir, `${e.id}.json.tmp`), '{"half');
    writeFileSync(path.join(dir, `${e.id}.json.bak.tmp`), 'x');
    new ExpeditionStore({ dir });
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(onDisk(e.id)).toEqual(e);
  });
});

describe('dying in the middle of a write leaves a valid JSON', () => {
  it.each(STEPS)('a crash before %s (simulated in-process)', (step) => {
    let crashAt: StepName | null = null;
    const s = new ExpeditionStore({
      dir,
      onStep: (n) => {
        if (n === crashAt) throw new Error('killed');
      },
    });
    const e0 = s.create('A');
    const e1 = clear(e0, '1-1', 100);
    s.merge(e0.id, clear(e0, '1-1', 99)); // a first merge, so the next write has a file to copy to .bak
    crashAt = step;
    expect(() => s.merge(e0.id, e1)).toThrow('killed');
    const after = onDisk(e0.id);
    expect(after).not.toBeNull(); // valid, whatever the step
    expect(after!.levels['1-1']!.done).toBe(true); // the previous merge always survives
    expect(new ExpeditionStore({ dir }).get(e0.id)).not.toBeNull();
  });

  it.each(STEPS)('SIGKILL of a real process right before %s', (step) => {
    const seed = new ExpeditionStore({ dir });
    const e0 = seed.create('A');
    seed.merge(e0.id, clear(e0, '1-1', 100));
    const before = onDisk(e0.id)!;
    const child = spawnSync(process.execPath, ['--import', 'tsx', path.resolve(__dirname, 'crash-writer.ts'), dir, e0.id, step, '1-2'], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(child.signal).toBe('SIGKILL'); // it really died at the step: it never reached the line after the write
    expect(child.stdout).not.toContain('survived');
    const after = onDisk(e0.id);
    expect(after).not.toBeNull();
    expect(after!.levels['1-1']!.done).toBe(true);
    // 'rename' is the commit point: dying before it keeps the old version, so 1-2 is not there
    expect(after!.levels['1-2']).toBeUndefined();
    expect(after!.updatedAt).toBe(before.updatedAt);
    expect(new ExpeditionStore({ dir }).get(e0.id)).toEqual(after);
  });

  it('the same child, left alone, does write (the harness is not vacuous)', () => {
    const seed = new ExpeditionStore({ dir });
    const e0 = seed.create('A');
    const child = spawnSync(process.execPath, ['--import', 'tsx', path.resolve(__dirname, 'crash-writer.ts'), dir, e0.id, 'none', '1-1'], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(child.stdout).toContain('survived');
    expect(onDisk(e0.id)!.levels['1-1']!.done).toBe(true);
  });
});

describe('reset goes to a recoverable trash', () => {
  it('moves the file to trash/, lists it and restores it whole', () => {
    const s = new ExpeditionStore({ dir, now: () => 1000 });
    const e0 = s.create('A');
    const e1 = clear(clear(e0, '1-1', 5), '1-2', 6);
    s.merge(e0.id, e1);
    const name = s.trash(e0.id);
    expect(existsSync(path.join(dir, `${e0.id}.json`))).toBe(false);
    expect(existsSync(path.join(dir, `${e0.id}.json.bak`))).toBe(false);
    expect(s.list()).toEqual([]);
    expect(
      () =>
        s.get(e0.id) ??
        (() => {
          throw new Error('null');
        })(),
    ).toThrow('null');
    expect(s.listTrash().map((t) => t.name)).toEqual([name]);
    expect(s.restore(name)).toEqual(s.get(e0.id));
    expect(s.get(e0.id)!.levels['1-2']!.done).toBe(true);
    expect(s.listTrash()).toEqual([]);
  });
  it('restoring does not overwrite an expedition that exists again, and a bad name is refused', () => {
    const s = new ExpeditionStore({ dir, now: () => 1000 });
    const e0 = s.create('A');
    const name = s.trash(e0.id);
    writeFileSync(path.join(dir, `${e0.id}.json`), JSON.stringify({ ...e0, name: 'B' }));
    expect(() => s.restore(name)).toThrow(ExpeditionError);
    expect(s.get(e0.id)!.name).toBe('B');
    expect(() => s.restore('../x.json')).toThrow(ExpeditionError);
  });
  it('trashing twice in the same instant does not clobber the first trash', () => {
    const s = new ExpeditionStore({ dir, now: () => 1000 });
    const a = s.create('A'),
      b = s.create('B');
    s.trash(a.id);
    s.trash(b.id);
    expect(s.listTrash().length).toBe(2);
  });
});

describe('one room at a time', () => {
  it('a second room is refused until the first releases, and a stale claim expires', () => {
    let t = 0;
    const s = new ExpeditionStore({ dir, now: () => t, claimTtlMs: 1000 });
    const e = s.create('A');
    expect(s.claim(e.id, 'AAAA')).toEqual({ ok: true });
    expect(s.claim(e.id, 'AAAA')).toEqual({ ok: true });
    expect(s.claim(e.id, 'BBBB')).toEqual({ ok: false, room: 'AAAA' });
    expect(s.list()[0]!.active).toBe(true);
    s.release(e.id, 'BBBB'); // not the owner: no effect
    expect(s.claim(e.id, 'BBBB').ok).toBe(false);
    s.release(e.id, 'AAAA');
    expect(s.claim(e.id, 'BBBB')).toEqual({ ok: true });
    t = 5000;
    expect(s.claim(e.id, 'CCCC')).toEqual({ ok: true }); // BBBB went silent
  });
});

describe('the HTTP API, and "Continuar" after the server restarts', () => {
  it('serves create / merge / claim / reset / restore, and a new server on the same folder offers the right level', async () => {
    let srv = await startServer({ port: 0, mode: 'none', dataDir: dir });
    const url = (p: string) => `http://127.0.0.1:${srv.port}${p}`;
    const call = async (method: string, p: string, body?: unknown) => {
      const r = await fetch(url(p), {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, body: (await r.json()) as any };
    };
    try {
      const created = await call('POST', '/api/expeditions', { name: 'Nico y Angi' });
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      expect(continueLevel(created.body, CAMPAIGN_CATALOG)?.id).toBe('1-1');

      expect((await call('POST', `/api/expeditions/${id}/claim`, { room: 'MAIN' })).status).toBe(200);
      expect((await call('POST', `/api/expeditions/${id}/claim`, { room: 'OTRA' })).status).toBe(409);

      const played = clear(created.body, '1-1', Date.now());
      const merged = await call('POST', `/api/expeditions/${id}/merge`, played);
      expect(merged.status).toBe(200);
      expect(merged.body.levels['1-1'].done).toBe(true);
      expect((await call('POST', `/api/expeditions/${id}/merge`, { junk: true })).status).toBe(400);
      expect((await call('GET', '/api/expeditions/exp-nothere1')).status).toBe(404);
      expect((await call('GET', '/api/expeditions/..%2Fx')).status).toBe(400);

      await srv.close(); // the server stops...
      srv = await startServer({ port: 0, mode: 'none', dataDir: dir }); // ...and comes back on the same folder

      const list = await call('GET', '/api/expeditions');
      expect(list.body.expeditions).toHaveLength(1);
      expect(list.body.expeditions[0]).toMatchObject({ id, name: 'Nico y Angi', stars: 2, lastLevelId: '1-1', active: false }); // claims do not survive a restart
      const back = await call('GET', `/api/expeditions/${id}`);
      expect(continueLevel(back.body, CAMPAIGN_CATALOG)?.id).toBe('1-2'); // "Continuar" offers 1-2

      const del = await call('DELETE', `/api/expeditions/${id}`);
      expect(del.status).toBe(200);
      expect((await call('GET', '/api/expeditions')).body.expeditions).toEqual([]);
      const trash = await call('GET', '/api/expeditions-trash');
      expect(trash.body.trash).toHaveLength(1);
      const restored = await call('POST', `/api/expeditions-trash/${trash.body.trash[0].name}/restore`);
      expect(restored.status).toBe(200);
      expect(continueLevel(restored.body, CAMPAIGN_CATALOG)?.id).toBe('1-2');
    } finally {
      await srv.close();
    }
  });
  it('a server that never plays the campaign leaves no folder behind', async () => {
    const empty = path.join(dir, 'never');
    const srv = await startServer({ port: 0, mode: 'none', dataDir: empty });
    await srv.close();
    expect(existsSync(empty)).toBe(false);
  });
});
