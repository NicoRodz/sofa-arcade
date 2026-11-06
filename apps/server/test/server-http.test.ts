// The HTTP half of the server (the relay has its own tests): the redirect, the join info the TV shows as a QR, where the campaign progress lives on disk
// (lazy folder, opts.dataDir over PG_DATA_DIR, progress that survives a restart), what static mode does without a build, and a clean close.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../src/server';

type Srv = Awaited<ReturnType<typeof startServer>>;
let dir = '';
const open: Srv[] = [];
const boot = async (o: { mode?: 'none' | 'static'; dataDir?: string } = {}) => {
  const s = await startServer({ port: 0, mode: o.mode ?? 'none', dataDir: o.dataDir });
  open.push(s);
  return s;
};
const url = (s: Srv, p: string) => `http://127.0.0.1:${s.port}${p}`;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'pg-http-'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const s of open.splice(0)) await s.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the root and the join info', () => {
  it('sends / to the screen app', async () => {
    const s = await boot({ dataDir: dir });
    const r = await fetch(url(s, '/'), { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/screen');
  });
  it('the join url points at the phone app on this port, with a QR that is an svg', async () => {
    const s = await boot({ dataDir: dir });
    const j = (await (await fetch(url(s, '/api/info'))).json()) as { url: string; qrSvg: string };
    expect(j.url).toMatch(new RegExp(`^http://[^/]+:${s.port}/c$`));
    expect(j.qrSvg.startsWith('<svg')).toBe(true);
  });
  it('carries the room in the url, cut to 16 characters and escaped', async () => {
    const s = await boot({ dataDir: dir });
    const long = (await (await fetch(url(s, '/api/info?room=ABCDEFGHIJKLMNOPQRSTUV'))).json()) as { url: string };
    expect(long.url.endsWith('/c?room=ABCDEFGHIJKLMNOP')).toBe(true);
    const odd = (await (await fetch(url(s, `/api/info?room=${encodeURIComponent('a b&c')}`))).json()) as { url: string };
    expect(odd.url.endsWith('/c?room=a%20b%26c')).toBe(true);
  });
  it('ignores a room that is not a single string (?room=a&room=b)', async () => {
    const s = await boot({ dataDir: dir });
    const j = (await (await fetch(url(s, '/api/info?room=a&room=b'))).json()) as { url: string };
    expect(j.url.endsWith('/c')).toBe(true);
  });
});

describe('the campaign progress on disk', () => {
  it('creates the folder only when the campaign is first used', async () => {
    const data = path.join(dir, 'later');
    const s = await boot({ dataDir: data });
    await fetch(url(s, '/api/info'));
    expect(existsSync(data)).toBe(false);
    expect((await fetch(url(s, '/api/expeditions'))).status).toBe(200);
    expect(existsSync(data)).toBe(true);
  });
  it('opts.dataDir wins over PG_DATA_DIR', async () => {
    const env = path.join(dir, 'env');
    const own = path.join(dir, 'own');
    vi.stubEnv('PG_DATA_DIR', env);
    const s = await boot({ dataDir: own });
    await fetch(url(s, '/api/expeditions'));
    expect(existsSync(own)).toBe(true);
    expect(existsSync(env)).toBe(false);
  });
  it('without opts.dataDir it falls back to PG_DATA_DIR', async () => {
    const env = path.join(dir, 'env');
    vi.stubEnv('PG_DATA_DIR', env);
    const s = await boot();
    await fetch(url(s, '/api/expeditions'));
    expect(existsSync(env)).toBe(true);
  });
  it('an expedition created over HTTP is still there after the server restarts', async () => {
    const a = await boot({ dataDir: dir });
    const made = await fetch(url(a, '/api/expeditions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nico y Angi' }),
    });
    expect(made.status).toBe(201);
    const { id } = (await made.json()) as { id: string };
    await a.close();
    open.length = 0;
    const b = await boot({ dataDir: dir });
    const got = await fetch(url(b, `/api/expeditions/${id}`));
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({ id, name: 'Nico y Angi' });
  });
});

describe('static mode and close', () => {
  it('static mode without a build answers 404 for the apps instead of falling over', async () => {
    const s = await boot({ mode: 'static', dataDir: dir });
    expect((await fetch(url(s, '/screen/nothing-here.js'))).status).toBe(404);
    expect((await fetch(url(s, '/c/nothing-here.js'))).status).toBe(404);
  });
  it('mode none serves no app at all', async () => {
    const s = await boot({ dataDir: dir });
    expect((await fetch(url(s, '/screen/'))).status).toBe(404);
  });
  it('close() drops the connected sockets and frees the port', async () => {
    const s = await boot({ dataDir: dir });
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    const closed = new Promise<void>((r) => ws.once('close', () => r()));
    await s.close();
    open.length = 0;
    await closed;
    await expect(fetch(url(s, '/api/info'))).rejects.toThrow();
  });
});
