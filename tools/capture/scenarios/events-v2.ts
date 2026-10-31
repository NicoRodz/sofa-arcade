import { WebSocket } from 'ws';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { phoneKey } from '@pichi/game-pizzas/sim/school';
import { Cdp } from '../browser';
import { CDP, PORT, sleep } from '../config';
import type { Ctx } from '../session';

// EVENTS_V2 on map 10, Normal, 4 bots + 1 real controller (a second CDP target, phone-sized): per event the TV before / during / closing card, and the phone's note and labelled button.
// Every event is forced with window.__pg.kit.event(kind); the closes go through the real sim paths (kit.ev2Win) so the card is the one the game draws.
type Kind = 'rush' | 'birthday' | 'blackout' | 'spill';
const NAME: Record<Kind, string> = { rush: 'rush', birthday: 'birthday', blackout: 'blackout', spill: 'spill' };
const ROOMS: Record<Kind, string> = { rush: 'EVRU', birthday: 'EVBD', blackout: 'EVBL', spill: 'EVSP' };

// a controller page in its own target: school skipped (phoneKey(token) in localStorage), the stored room + name make it rejoin on load
async function openPhone(room: string): Promise<Cdp> {
  const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  const ph = new Cdp(ws);
  await ph.send('Page.enable');
  await ph.send('Runtime.enable');
  await ph.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await ph.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await ph.send('Emulation.setFocusEmulationEnabled', { enabled: true }); // a target in the background throttles its transitions: the note would be caught half faded
  const url = `http://127.0.0.1:${PORT}/c/?room=${room}`;
  await ph.send('Page.navigate', { url });
  await sleep(800);
  const token = `cap-${room}`;
  await ph.eval(
    `localStorage.setItem('pg.token', ${JSON.stringify(token)}); localStorage.setItem(${JSON.stringify(phoneKey(token))}, '1'); localStorage.setItem('pg.name', 'Vale'); localStorage.setItem('pg.room', ${JSON.stringify(room)})`,
  );
  await ph.send('Page.navigate', { url });
  await sleep(1500);
  return ph;
}

async function round(ctx: Ctx, kind: Kind) {
  const { cdp, open, join, click, snap, waitFor } = ctx;
  const room = ROOMS[kind];
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await open(room);
  await join(room, 4, fixedMap('10')!.rows, { menu: true });
  const ph = await openPhone(room);
  await cdp.send('Page.bringToFront');
  await cdp.eval('window.__pg.forceLobby()');
  await sleep(500);
  await click('[data-diff="normal"]');
  await click('[data-map="10"]');
  await click('#evs [data-ev="true"]');
  await sleep(300);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 25_000);
  const me = Math.max(...((await snap()) as any).players.map((p: any) => p.id)); // the real phone joined last
  const n = NAME[kind];
  await sleep(1500);
  await cdp.shot(`${n}-1-before`);
  await ph.shot(`${n}-phone-0-before`);
  await kit(`event('${kind}')`);
  await sleep(1300);
  await cdp.shot(`${n}-2-announce`);
  for (let i = 0; i < 40 && ((await snap()) as any).mid?.phase !== 'active'; i++) await sleep(150);
  await sleep(600);
  await cdp.shot(`${n}-3-during`);
  await ph.shot(`${n}-phone-1-note`);
  if (kind === 'birthday') {
    await sleep(4500); // the balloon burst has risen and gone; only the party at the top edge stays
    await cdp.shot(`${n}-3b-after-burst`);
  }
  const ev2 = await kit('ev2()');
  console.log(kind, 'ev2', JSON.stringify(ev2), 'mid', JSON.stringify(((await snap()) as any).mid));
  // the phone's chef goes to the thing the event adds, then the note has faded and the labelled button shows
  const station = kind === 'blackout' ? ev2?.board?.station : kind === 'birthday' ? ev2?.cake?.drawer?.station : undefined;
  if (station !== undefined && station >= 0) {
    await kit(`stand(${me}, ${station})`);
    await sleep(3500);
    await cdp.shot(`${n}-4-at-the-spot`);
    await ph.shot(`${n}-phone-2-button`);
  }
  await kit(`ev2Win('${kind}')`);
  await sleep(700);
  await cdp.shot(`${n}-5-card`);
  await ph.shot(`${n}-phone-3-close`);
  console.log(kind, 'after close ev2', JSON.stringify(await kit('ev2()')));
  ph.close();
  await cdp.send('Page.bringToFront');
}

export const runEventsV2 = (kinds: Kind[]) => async (ctx: Ctx) => {
  for (const k of kinds) {
    await round(ctx, k);
    for (const b of ctx.bots.splice(0)) b.close();
  }
};
