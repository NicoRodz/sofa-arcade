// Magnetism over the real relay: two phones are websockets driven by the imperfect human bot (shared/feel/human-bot.ts). Their inputs go through the relay, a Node "screen"
// rebuilds the controls the way the real one does (press counters, held B) and hosts the sim. The same attempts run with the magnet off and on: the magnet must land more
// first presses THROUGH the wire, an Ayudante beside plain chefs must keep working with it, and a round of the lobby's own rules (magnet from roundRules) must be playable.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { DEFAULT_CONFIG, PressTracker, type ServerMsg } from '@party/shared';
import { addPlayer, createGame, tick, type Controls } from '@party/shared/game';
import { FIXED_MAPS, isFloor } from '@party/shared/maps';
import { roundRules } from '@party/shared/midround';
import { ACTIONS, runGame, stationsFor, type Action, type Sim } from '../../shared/feel/human-bot';
import { startServer } from '../src/server';
import { Phone, kit, idle, until } from './rules-kit';

beforeAll(async () => { kit.srv = await startServer({ port: 0, mode: 'none' }); });
afterAll(async () => { await kit.srv.close(); });

/** Two phones + a Node screen: `sim.tick` sends the chefs' controls through the relay and ticks the sim with what comes back. */
async function relay(room: string) {
  const screenWs = new WebSocket(`ws://127.0.0.1:${kit.srv.port}/ws?role=screen&room=${room}`);
  const ids: number[] = [];
  const latest = new Map<number, { x: number; y: number; btn: number; presses: number[]; seq: number }>();
  screenWs.on('message', (d) => {
    const m = JSON.parse(d.toString()) as ServerMsg;
    if (m.t === 'player_joined' && !ids.includes(m.player.id)) ids.push(m.player.id);
    else if (m.t === 'input') latest.set(m.playerId, { x: m.x, y: m.y, btn: m.btn, presses: m.presses, seq: m.seq });
  });
  await new Promise<void>((r) => screenWs.once('open', () => r()));
  const phones = [new Phone(room, 'Bot1'), new Phone(room, 'Bot2')];
  await until(() => phones.every((p) => p.id > 0) && ids.length === 2, 'phones joined');
  screenWs.send(JSON.stringify({ t: 'config', ...DEFAULT_CONFIG }));
  screenWs.send(JSON.stringify({ t: 'phase', phase: 'playing' }));
  await until(() => phones.every((p) => p.phase?.phase === 'playing'), 'phase playing');
  const trackers = new Map(phones.map((p) => [p.id, new PressTracker()]));
  for (const p of phones) p.sendControls(idle);
  await until(() => phones.every((p) => latest.get(p.id)?.seq === 0), 'baseline inputs');
  for (const p of phones) trackers.get(p.id)!.update(latest.get(p.id)!.presses);
  let frame = 0, wire = 0;
  const sim: Sim = {
    createGame, addPlayer, isFloor, maps: FIXED_MAPS.slice(0, 6),
    async tick(g, c) { // chef k+1 plays on phone k
      const want = ++frame;
      phones.forEach((p, k) => p.sendControls(c.get(k + 1) ?? idle));
      await until(() => phones.every((p) => latest.get(p.id)!.seq >= want), `inputs of frame ${want}`, 3000);
      const controls = new Map<number, Controls>();
      phones.forEach((p, k) => {
        const l = latest.get(p.id)!, d = trackers.get(p.id)!.update(l.presses);
        controls.set(k + 1, { x: l.x, y: l.y, a: d[0] ?? 0, b: (l.btn & 2) !== 0, bTaps: d[1] ?? 0 });
        if (d[0] || d[1]) wire++;
      });
      tick(g, controls);
    },
  };
  return { sim, presses: () => wire, close: () => { screenWs.close(); phones.forEach((p) => p.ws.close()); } };
}

/** The same fixed list of attempts for every configuration: first-press and eventual hit rates of chef 1 (chef 2 plays another interaction beside it). */
async function attempts(sim: Sim, gameOpts: Record<string, unknown>, n = 30) {
  let first = 0, hit = 0, k = 0;
  const kinds: Action[] = ['take', 'drop', 'pickup', 'place', 'oven', 'chop'];
  for (let i = 0; i < n; i++) {
    const mi = i % 6, action = kinds[i % kinds.length]!;
    const probe = createGame({ mapId: sim.maps[mi]!.id, rows: sim.maps[mi]!.rows, spawns: sim.maps[mi]!.spawns });
    const list = stationsFor(probe, action);
    if (!list.length) continue;
    const other = ACTIONS.find((a) => a !== action && a !== 'deliver' && stationsFor(probe, a).length > 1)!;
    const station = list[(i * 7) % list.length]!, s2 = stationsFor(probe, other).find((s: number) => s !== station)!;
    const [res] = await runGame(sim, mi, [{ action, station }, { action: other, station: s2 }], 500 + i, { difficulty: 'normal', ...gameOpts });
    k++; first += res!.first ? 1 : 0; hit += res!.hit ? 1 : 0;
  }
  return { n: k, first: first / k, hit: hit / k };
}

describe('magnetism over the relay', () => {
  it('lands more first presses with the magnet on than off, through the wire (phones -> relay -> screen -> sim)', async () => {
    const r = await relay('mg1');
    const off = await attempts(r.sim, {});
    const on = await attempts(r.sim, { magnet: true });
    r.close();
    expect(off.n).toBeGreaterThanOrEqual(25);
    expect(r.presses()).toBeGreaterThan(40); // presses really crossed the relay
    expect(on.first).toBeGreaterThan(off.first + 0.12);
    expect(on.first).toBeGreaterThan(0.8);
    expect(on.hit).toBeGreaterThanOrEqual(off.hit);
  }, 180_000);
  it('an Ayudante beside a plain chef: both work with the magnet on, and the Ayudante still beats the plain chef without it', async () => {
    const r = await relay('mg2');
    const assistOn = await attempts(r.sim, { magnet: true, assist: [1] }, 24);
    const assistOff = await attempts(r.sim, { assist: [1] }, 24);
    const plainOff = await attempts(r.sim, {}, 24);
    r.close();
    expect(assistOn.first).toBeGreaterThan(0.75);
    expect(assistOn.hit).toBeGreaterThan(0.85);
    expect(assistOff.first).toBeGreaterThan(plainOff.first + 0.1); // the profile is still the profile
  }, 240_000);
  it('the lobby\'s own rules (roundRules: burn, fire, events, magnet) make a playable round over the relay', async () => {
    const r = await relay('mg3');
    expect(roundRules({}, 'normal').magnet).toBe('normal');
    const res = await attempts(r.sim, { ...roundRules({}, 'normal') }, 12);
    r.close();
    expect(res.first).toBeGreaterThan(0.7);
  }, 120_000);
});
