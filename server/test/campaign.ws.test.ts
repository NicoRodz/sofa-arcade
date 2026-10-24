// The campaign over the real stack, minus the browser: two bots are phones on websockets, the relay forwards their inputs to the "screen", and the
// screen is the same code the real one runs (ObstRun for the world, CampaignFlow + CampaignApi for the progress, against the real HTTP API).
// 1-1 is played by the bots, the progress lands on disk, the server is stopped and started again on the same folder, and "Continuar" offers 1-2.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ServerMsg } from '@party/shared';
import { ObstBot, snapshot } from '@party/shared/obstaculos';
import { LEGACY_CATALOG, continueLevel, continueLabel, parseExpedition } from '@party/shared/obstaculos/campaign';
import { ObstRun } from '../../screen/src/games/obstaculos/host';
import { CampaignApi } from '../../screen/src/games/obstaculos/campaign/api';
import { CampaignFlow } from '../../screen/src/games/obstaculos/campaign/flow';
import { MemKV } from '../../screen/src/games/obstaculos/campaign/testkit';
import { startServer } from '../src/server';

let dir = '';
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'pg-camp-ws-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class BotPhone {
  ws: WebSocket;
  slot = -1; seq = 0; a = 0; b = 0;
  bot: ObstBot | null = null;
  constructor(port: number, room: string, readonly name: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `tok-${room}-${name}` })));
    this.ws.on('message', (d) => { const m = JSON.parse(d.toString()) as ServerMsg; if (m.t === 'joined') { this.slot = m.player.slot; this.bot = new ObstBot(m.player.slot); } });
  }
  send(o: { x: number; y: number; jump: boolean; grab: boolean }) {
    if (o.jump) this.a++;
    if (o.grab) this.b++;
    this.ws.send(JSON.stringify({ t: 'input', seq: this.seq++, x: o.x, y: o.y, btn: 0, presses: [this.a, this.b], ts: Date.now() }));
  }
}

describe('two bots on websockets play 1-1 and the campaign moves on', () => {
  it('saves 1-1, survives a server restart and offers 1-2 in Continuar', async () => {
    let srv = await startServer({ port: 0, mode: 'none', dataDir: dir });
    const kv = new MemKV(); // the Mac's localStorage: it survives the server restart
    const mkFlow = (port: number, room: string, storage: MemKV = kv) => new CampaignFlow({ api: new CampaignApi(undefined, `http://127.0.0.1:${port}/api/expeditions`), catalog: LEGACY_CATALOG, room, kv: storage });
    const room = 'CAMP';
    const phones: BotPhone[] = [];
    let screen: WebSocket | null = null;
    try {
      // the screen: connects as the screen of the room and keeps who is who
      screen = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?role=screen&room=${room}`);
      const run: { current: ObstRun | null } = { current: null };
      const slotOf = new Map<number, number>();
      const got = { inputs: 0 };
      screen.on('message', (d) => {
        const m = JSON.parse(d.toString()) as ServerMsg;
        if (m.t === 'player_joined') slotOf.set(m.player.id, m.player.slot);
        else if (m.t === 'input') { got.inputs++; const slot = slotOf.get(m.playerId); if (slot !== undefined) run.current?.receive(slot, { x: m.x, y: m.y, presses: m.presses }); }
      });
      await new Promise((r) => screen!.once('open', r));
      phones.push(new BotPhone(srv.port, room, 'Nico'), new BotPhone(srv.port, room, 'Angi'));
      for (let i = 0; i < 100 && (slotOf.size < 2 || phones.some((p) => p.slot < 0)); i++) await sleep(20);
      expect(slotOf.size).toBe(2);

      // Nueva expedición, then 1-1 from the map
      const flow = mkFlow(srv.port, room);
      expect(await flow.create(['Nico', 'Angi'])).toEqual({ ok: true });
      const id = flow.exp!.id;
      const spec = flow.spec('1-1', 2);
      if ('ok' in spec) throw new Error(spec.reason);
      flow.begin('1-1');
      let over = false;
      run.current = new ObstRun({ mode: spec.mode, difficulty: 'normal', level: 1, seed: 1, slots: [0, 1], levels: [spec.def] }, {
        names: (s) => `J${s + 1}`, bus: { emit: () => {} }, onOver: () => { over = true; }, onLevelEnd: (e) => { void flow.levelEnd(e); },
      });
      const r = run.current;
      for (let i = 0; i < 4000 && !over; i++) {
        const s = r.session;
        if (s.status === 'playing') {
          const snap = snapshot(s.world);
          const view = { tick: s.world.tick, grid: s.world.grid, players: snap.players, goal: snap.goal };
          for (const p of phones) p.send(p.bot!.decide(view));
          await sleep(2); // the packets cross the relay before the next frame
        }
        r.step(1000 / 30);
      }
      expect(over).toBe(true);
      expect(got.inputs).toBeGreaterThan(100); // the bots really played over the wire
      flow.failed();
      await flow.settle();
      expect(flow.outcome).toMatchObject({ levelId: '1-1', cleared: true, saved: true, next: { id: '1-2' } });
      expect(flow.outcome!.after.stars[0]).toBe(true);

      const saved = parseExpedition(JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8')));
      expect(saved?.levels['1-1']).toMatchObject({ done: true });
      expect(saved?.name).toBe('Nico y Angi');

      // the server dies and comes back on the same folder
      phones.forEach((p) => p.ws.close()); screen.close();
      await srv.close();
      srv = await startServer({ port: 0, mode: 'none', dataDir: dir });

      const again = mkFlow(srv.port, 'OTRA'); // a fresh screen (even in another room) with the same localStorage
      const hub = await again.hub();
      expect(hub.offline).toBe(false);
      expect(hub.last && continueLevel(hub.last, LEGACY_CATALOG)?.id).toBe('1-2');
      expect(continueLabel(hub.last!, LEGACY_CATALOG)).toMatch(/^Continuar · Nico y Angi · Playa 1-2 · \d★$/);
      expect(await again.open(id)).toEqual({ ok: true }); // the old room's claim did not survive the restart
      expect(again.spec('1-2', 2)).toMatchObject({ level: { id: '1-2' } }); // and 1-2 is open
      // with the Mac's storage wiped too, the most recent expedition is still offered
      expect((await mkFlow(srv.port, 'TERCERA', new MemKV()).hub()).last?.id).toBe(id);
    } finally {
      phones.forEach((p) => p.ws.close());
      screen?.close();
      await srv.close();
    }
  }, 60_000);
});
