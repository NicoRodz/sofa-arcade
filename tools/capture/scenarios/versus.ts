import { versusMap } from '@pichi/game-pizzas/sim/versus/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

export async function runVersus({ cdp, bots, timers, open, join, click, snap, waitFor }: Ctx) {
  // Versus F1: lobby with 6 players (3 v 3) and 5 (3 v 2, k), a V1 round with 6 bots, the time-up banner and the results
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const rows = versusMap('V1')!.rows;
  await open('VS06');
  await join('VS06', 6, rows);
  await cdp.shot('vs-lobby-coop-6');
  await click('[data-mode="versus"]');
  await sleep(1000);
  await cdp.shot('vs-lobby-6');
  bots.splice(0).forEach((b) => b.close());
  await open('VS05');
  await join('VS05', 5, rows);
  await click('[data-mode="versus"]');
  await sleep(1000);
  await cdp.shot('vs-lobby-5');
  bots.splice(0).forEach((b) => b.close());
  await open('VS02');
  await join('VS02', 2, rows);
  await click('[data-mode="versus"]');
  await sleep(600);
  await cdp.shot('vs-lobby-2-refused');
  bots.splice(0).forEach((b) => b.close());
  await open('VS6P');
  await join('VS6P', 6, rows);
  await click('[data-mode="versus"]');
  await click('[data-map="V1"]');
  await click('[data-diff="easy"]');
  await sleep(400);
  await click('#start');
  await sleep(1500);
  await cdp.shot('vs-howto');
  await key('Enter');
  await sleep(2100);
  await cdp.shot('vs-6-countdown');
  bots.forEach((b) => b.startSending());
  timers.push(
    setInterval(async () => {
      try {
        const s = await snap();
        bots.forEach((b) => b.decide(s));
      } catch {
        /* page navigating */
      }
    }, 100),
  );
  const both = await waitFor((s) => (s as any).teams?.every((t: any) => t.delivered >= 1), Number(process.env.WAIT_MS ?? 110_000));
  console.log('both teams delivered:', !!both, JSON.stringify((both as any)?.teams));
  await cdp.shot('vs-6-play');
  await cdp.eval('window.__pg.fastForward(12000)');
  await sleep(2500);
  await cdp.shot('vs-6-last-seconds');
  await sleep(11000);
  await cdp.shot('vs-6-timeup');
  await sleep(5000);
  await cdp.shot('vs-6-results');
  console.log(
    'final',
    JSON.stringify(
      await cdp.eval(
        'JSON.parse(JSON.stringify({ t: window.__pg.snapshot().teams, w: window.__pg.snapshot().winner, ph: window.__pg.snapshot().phase }))',
      ),
    ),
  );
  timers.splice(0).forEach(clearInterval);
  bots.splice(0).forEach((b) => b.close());
}

export async function runVsHud({ cdp, bots, timers, open, join, click, snap, waitFor }: Ctx) {
  // Versus F4: the HUD of a running round with 6 chefs on V1 and V3 (queues, scoreboard, streak, golden order, hidden score), then the results
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const maps = (process.env.VS_MAPS ?? 'V1,V3').split(',');
  for (const id of maps) {
    const rows = versusMap(id)!.rows;
    const room = `H${id}X`.slice(0, 4);
    await open(room);
    await join(room, 6, rows);
    await click('[data-mode="versus"]');
    await click(`[data-map="${id}"]`);
    await click('[data-diff="easy"]');
    await sleep(400);
    await click('#start');
    await sleep(1500);
    await key('Enter');
    await sleep(2100);
    bots.forEach((b) => b.startSending());
    timers.push(
      setInterval(async () => {
        try {
          const s = await snap();
          bots.forEach((b) => b.decide(s));
        } catch {
          /* page navigating */
        }
      }, 100),
    );
    await waitFor((s) => s.time > 9_000, 30_000);
    await cdp.eval('window.__pg.setTeam(0, { score: 340, streak: 3, bestStreak: 3, vips: 1 })');
    await cdp.eval('window.__pg.setTeam(1, { score: 410, streak: 1 })');
    await cdp.eval('window.__pg.vipNow()');
    await sleep(700);
    await cdp.shot(`vs-hud-${id}-vip`);
    await cdp.eval('window.__pg.fastForward(15000)');
    await sleep(1500);
    await cdp.shot(`vs-hud-${id}-hidden`);
    timers.splice(0).forEach(clearInterval);
    bots.splice(0).forEach((b) => b.close());
  }
}

export async function runVsLobby({ cdp, bots, open, join, click }: Ctx) {
  await open('VSLB');
  await join('VSLB', 6, versusMap('V1')!.rows);
  await click('[data-mode="versus"]');
  await sleep(900);
  await cdp.shot('vs-lobby-colors');
  bots.splice(0).forEach((b) => b.close());
}

export async function runVsDrop({ cdp, bots, open, join, click, snap, waitFor }: Ctx) {
  // Versus: a chef's phone drops (ghost, notice), the grace time runs out (leaves, the handicap goes up for its team)
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  await open('VSDR');
  await join('VSDR', 6, versusMap('V1')!.rows);
  await click('[data-mode="versus"]');
  await click('[data-map="V1"]');
  await click('[data-diff="easy"]');
  await sleep(400);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 12_000, 40_000);
  const id = (await snap()).players[0]!.id;
  await cdp.eval(`window.__pg.dropChef(${id})`);
  await sleep(700);
  await cdp.shot('vs-drop-ghost');
  await waitFor((s) => s.time > 33_500, 40_000);
  await sleep(300);
  await cdp.shot('vs-drop-gone');
  console.log('teams after the drop:', JSON.stringify(((await snap()) as any).teams));
  bots.splice(0).forEach((b) => b.close());
}

export async function runEventsVs({ cdp, bots, open, join, click, waitFor }: Ctx) {
  // Versus on V3 (rotation, ovens with counters beside them): the burning oven and a blackout reach both kitchens. Hard + Caos (the sabotage level that allows fire).
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  await open('EVVS');
  await join('EVVS', 4, versusMap('V3')!.rows);
  await click('[data-mode="versus"]');
  await click('[data-map="V3"]');
  await click('[data-diff="hard"]');
  await sleep(500);
  await cdp.shot('evvs-0-lobby');
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
  const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
  const ovens = (await kit('counters()')).filter((c: any) => c.kind === 'pot');
  for (const o of ovens) await kit(`bake(${o.i})`);
  for (const o of ovens) await kit(`age(${o.i}, 5500)`);
  await sleep(500);
  await cdp.shot('evvs-1-warn');
  for (const o of ovens) await kit(`age(${o.i}, 13100)`);
  await kit(`event('blackout')`);
  await sleep(1500);
  await cdp.shot('evvs-2-fire-banner');
  await sleep(3500);
  await cdp.shot('evvs-3-dark');
  bots.splice(0).forEach((b) => b.close());
}

export async function runVsPantry({ cdp, bots, open, join, click, waitFor }: Ctx) {
  // Versus F5: the shared pantry of V2 with 6 chefs: full stock, then drained with the refill bar running
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  await open('VSPT');
  await join('VSPT', 6, versusMap('V2')!.rows);
  await click('[data-mode="versus"]');
  await click('[data-map="V2"]');
  await click('[data-diff="easy"]');
  await sleep(400);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
  await cdp.shot('vs-pantry-full');
  await cdp.eval('window.__pg.setPantry(1, 3500)');
  await sleep(600);
  await cdp.shot('vs-pantry-low');
  await cdp.eval('window.__pg.setPantry(0, 5000)');
  await sleep(600);
  await cdp.shot('vs-pantry-empty');
  bots.splice(0).forEach((b) => b.close());
}

export async function runVsResults({ cdp, bots, open, join, click, snap, waitFor }: Ctx) {
  // Versus F4: the results of a round with a winner, then (Revancha) of a draw with the series; the phone's own verdict is in versus-phone
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const rows = versusMap('V1')!.rows;
  await open('VSRS');
  await join('VSRS', 6, rows);
  await click('[data-mode="versus"]');
  await click('[data-map="V1"]');
  await click('[data-diff="easy"]');
  await sleep(400);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 800, 20_000);
  const ids = (await snap()).players.map((p) => p.id);
  const stats = (i: number, o: object) => cdp.eval(`window.__pg.setTeam(${i}, ${JSON.stringify(o)})`);
  await stats(0, { score: 410, gross: 410, delivered: 7, bestStreak: 4, vips: 1, tips: 180, expired: 1, reachedAt: 150000 });
  await stats(1, {
    score: 340,
    gross: 340,
    delivered: 6,
    bestStreak: 3,
    vips: 0,
    tips: 120,
    expired: 2,
    rejected: 1,
    reachedAt: 170000,
  });
  for (const [i, n] of [
    [0, 4],
    [1, 2],
    [2, 1],
    [3, 3],
    [4, 2],
    [5, 1],
  ] as const)
    await cdp.eval(`window.__pg.setDelivered(${ids[i]}, ${n})`);
  await cdp.eval('window.__pg.fastForward(800)');
  await waitFor((s) => (s as any).over === true, 8000);
  await sleep(850);
  await cdp.shot('vs-timeup-reveal');
  await sleep(1300);
  await cdp.shot('vs-results-reveal');
  await sleep(3300);
  await cdp.shot('vs-results-win');
  await click('#vs-rematch');
  await waitFor((s) => s.phase === 'playing' && s.countdown <= 0 && s.time > 800, 20_000);
  await stats(0, { score: 300, gross: 300, delivered: 5, bestStreak: 2, vips: 1, tips: 90, reachedAt: 100000 });
  await stats(1, { score: 300, gross: 300, delivered: 5, bestStreak: 3, vips: 1, tips: 100, reachedAt: 100000 });
  await cdp.eval('window.__pg.fastForward(800)');
  await sleep(1500);
  await sleep(5000);
  await cdp.shot('vs-results-draw');
  bots.splice(0).forEach((b) => b.close());
}
