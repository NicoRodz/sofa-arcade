import { WebSocket } from 'ws';
import { PORT, sleep } from '../config';
import type { Ctx } from '../session';

// Manchazo F3: the TV with the five sabotages in play (cards in hand, then played: roller, footprints, fan gust, turpentine and glue marks on pinatas), and the
// phone with button 2 wearing the card in hand. Saved as manchazo-sab-*.png. `window.__pg.manchazoGive(slot, kind)` puts the card in a hand (capture tool only).
const KINDS = ['turpentine', 'roller', 'fan', 'footprints', 'glue'] as const;

/** Opens the TV on `room`, picks Manchazo, starts a round with 5 phones and leaves the bots barely leaning (they stay put). */
async function startRound({ cdp, bots, join, waitFor, click }: Ctx, room: string) {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1` });
  await sleep(2500);
  await join(room, 5, [], { menu: true });
  await sleep(500);
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  for (let i = 0; i < 4; i++) {
    const m = await cdp.eval<{ sel: number; cards: string[] }>('window.__pg.menu()');
    if (m.cards[m.sel]?.startsWith('arena:')) break;
    await key('ArrowRight');
    await sleep(150);
  }
  await key('Enter');
  await sleep(2200);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.phase === 'playing', 15_000);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 0],
  ] as const;
  bots.forEach((b, i) => {
    b.vec = { x: dirs[i]![0] * 0.01, y: dirs[i]![1] * 0.01 }; // barely leaning: they stay put
    b.startSending();
  });
  await sleep(1200);
}

export async function runManchazoSabotageTv(ctx: Ctx) {
  const { cdp, bots } = ctx;
  await startRound(ctx, 'MNSB');
  KINDS.forEach((k, slot) => void cdp.eval(`window.__pg.manchazoGive(${slot}, ${JSON.stringify(k)})`));
  await sleep(500);
  await cdp.shot('manchazo-sab-hands'); // pickups on the floor and a card over every body
  bots.forEach((b) => b.b++); // button 2: everyone plays the card in hand
  await sleep(200);
  bots.forEach((b) => b.a++); // button 1: turpentine and glue ride on the pinata
  await sleep(300);
  await cdp.shot('manchazo-sab-active'); // roller bar, footprints, gust, marked pinatas
  const heard = bots.map((b) => b.hints.slice(-1)[0]);
  console.log('last hint per phone', JSON.stringify(heard.map((h) => h && { a: h.a, b: h.b, bOff: h.bOff })));
  console.log('phones that heard a hint with a card name', heard.filter((h) => h && h.b).length);
}

export async function runManchazoSabotagePhone({ cdp }: Ctx) {
  const room = 'MNSP';
  const fake = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=screen&room=${room}`);
  await new Promise((r) => fake.once('open', r));
  fake.send(JSON.stringify({ t: 'config', game: 'arena', modeId: 'versus', difficulty: 'normal', map: '1', seed: 1 }));
  fake.send(JSON.stringify({ t: 'phase', phase: 'menu' }));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=${room}` });
  await sleep(1200);
  await cdp.eval(`document.getElementById('name').value = 'Nico'; document.getElementById('join').requestSubmit()`);
  await sleep(1200);
  fake.send(JSON.stringify({ t: 'phase', phase: 'lobby' }));
  await sleep(600);
  fake.send(JSON.stringify({ t: 'phase', phase: 'playing' }));
  await sleep(800);
  await cdp.shot('manchazo-sab-phone-empty'); // the manifest's own label, before the screen says anything
  const hint = { t: 'hint', a: null, b: 'Rodillo', bIcon: 'jump' }; // what the screen sends when the phone holds the roller
  for (let id = 0; id < 4; id++) fake.send(JSON.stringify({ ...hint, playerId: id }));
  await sleep(800);
  await cdp.shot('manchazo-sab-phone-roller');
  const lbl = await cdp.eval<string>(`document.getElementById('lblB').textContent`);
  console.log('button 2 label', lbl);
  if (!lbl.includes('Rodillo')) throw new Error(`button 2 says "${lbl}", not the card in hand`);
  fake.close();
}

// Manchazo F8a: the TV with the five new cards (one per body: tape, ink, sponge, swap, dizzy) and, once two are played (the tape on the floor, the ink's ghost ring
// round its body), and the phone with button 2 wearing the Cinta. Saved as manchazo-sab-plus-*.png.
const PLUS = ['tape', 'ink', 'sponge', 'swap', 'dizzy'] as const;

export async function runManchazoSabotagePlusTv(ctx: Ctx) {
  const { cdp, bots } = ctx;
  await startRound(ctx, 'MNSX');
  PLUS.forEach((k, slot) => void cdp.eval(`window.__pg.manchazoGive(${slot}, ${JSON.stringify(k)})`));
  await sleep(500);
  await cdp.shot('manchazo-sab-plus-hands'); // the five icons over the five bodies
  bots[0]!.b++; // tape: the border on the floor
  bots[1]!.b++; // ink: its team's paint is hidden (a ghost ring round the body)
  await sleep(400);
  await cdp.shot('manchazo-sab-plus-active'); // two sabotages active, the other three still in hand
}

export async function runManchazoSabotagePlusPhone(ctx: Ctx) {
  const { cdp } = ctx;
  const room = 'MNSQ';
  const fake = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=screen&room=${room}`);
  await new Promise((r) => fake.once('open', r));
  fake.send(JSON.stringify({ t: 'config', game: 'arena', modeId: 'versus', difficulty: 'normal', map: '1', seed: 1 }));
  fake.send(JSON.stringify({ t: 'phase', phase: 'menu' }));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=${room}` });
  await sleep(1200);
  await cdp.eval(`document.getElementById('name').value = 'Nico'; document.getElementById('join').requestSubmit()`);
  await sleep(1200);
  fake.send(JSON.stringify({ t: 'phase', phase: 'lobby' }));
  await sleep(600);
  fake.send(JSON.stringify({ t: 'phase', phase: 'playing' }));
  await sleep(800);
  for (let id = 0; id < 4; id++) fake.send(JSON.stringify({ t: 'hint', playerId: id, a: null, b: 'Cinta', bIcon: 'crate' })); // what the screen sends for the tape
  await sleep(800);
  await cdp.shot('manchazo-sab-plus-phone-tape');
  const lbl = await cdp.eval<string>(`document.getElementById('lblB').textContent`);
  console.log('button 2 label', lbl);
  if (!lbl.includes('Cinta')) throw new Error(`button 2 says "${lbl}", not the card in hand`);
  fake.close();
}
