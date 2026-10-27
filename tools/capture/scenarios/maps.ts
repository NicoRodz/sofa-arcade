import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

export async function runNewmaps({ cdp, bots, timers, open, join, click, snap, waitFor }: Ctx) {
  // lobby with 5 players (filter by N), then three new maps: 2 chefs, 5 chefs (sink + cheese), 8 chefs with bots
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const scenario: [string, number][] = (process.env.SCENARIOS ?? '6:2,10:5,12:8')
    .split(',')
    .map((x) => [x.split(':')[0]!, Number(x.split(':')[1])]);
  for (const [id, n] of scenario) {
    const room = `N${id}X`.padEnd(4, 'X').slice(0, 4);
    await open(room);
    await join(room, n, fixedMap(id)!.rows);
    await sleep(800);
    await cdp.shot(`lobby-n${n}`);
    if (Number(id) >= 20) await click('[data-map="group"]'); // the Carta larga series is a page of its own in the lobby
    await click(`[data-map="${id}"]`);
    await click('[data-diff="easy"]');
    await sleep(300);
    await cdp.shot(`lobby-n${n}-map${id}`);
    await click('#start');
    await sleep(1500);
    await key('Enter');
    await sleep(2100);
    await cdp.shot(`map${id}-n${n}-countdown`);
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
    await waitFor((s) => s.countdown <= 0 && s.time > 9000, 20_000);
    await cdp.shot(`map${id}-n${n}-icons`);
    const good = await waitFor(
      (s) => s.stations.some((x) => x.kind === 'pot' && x.inputs.length >= 2) && s.players.some((p) => p.cutting),
      Number(process.env.WAIT_MS ?? 70_000),
    );
    console.log(`map ${id} n=${n} scene ready:`, !!good);
    await sleep(1500);
    await cdp.shot(`map${id}-n${n}-play`);
    if (process.env.LATE) {
      await sleep(Number(process.env.LATE));
      await cdp.shot(`map${id}-n${n}-late`);
    }
    timers.splice(0).forEach(clearInterval);
    bots.splice(0).forEach((b) => b.close());
    await sleep(400);
  }
}

export async function runFase1({ cdp, bots, timers, open, join, click, snap, waitFor }: Ctx) {
  // phase 1 of the overcooked-2 plan: 4 chefs (streak badge, dash, results with stars) and 8 chefs on a map for 4-8
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  await open('F1AA');
  await join('F1AA', 4, fixedMap('1')!.rows);
  await click('[data-map="1"]');
  await sleep(300);
  await cdp.shot('f1-lobby');
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await sleep(2100);
  await cdp.shot('f1-4-countdown');
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
  const hot = await waitFor((s) => s.streak >= 2, Number(process.env.WAIT_MS ?? 110_000));
  console.log('streak >= 2 reached:', !!hot, hot ? `streak ${hot.streak} score ${hot.score}` : '');
  await sleep(250);
  await cdp.shot('f1-4-streak');
  timers.splice(0).forEach(clearInterval);
  // the dash: bot 0 runs to the right with B tapped; the screenshots fall inside the 180 ms and the dust after it
  const b0 = bots[0]!;
  for (const b of bots) {
    b.vec = { x: 0, y: 0 };
    b.btn = 0;
  }
  await sleep(500);
  const s0 = await snap();
  const me = s0.players.find((p) => p.id === b0.id)!;
  b0.vec = { x: 1, y: 0 };
  await sleep(200);
  b0.b++;
  await sleep(60);
  const s1 = await snap();
  const p1 = s1.players.find((p) => p.id === b0.id)!;
  const cx = 96 + p1.x * 108,
    cy = 106 + p1.y * 108;
  await cdp.shot('f1-4-dash', { x: Math.max(0, cx - 260), y: Math.max(0, cy - 230), width: 520, height: 330, scale: 2 });
  console.log('dash: x before', me.x.toFixed(2), 'x 60 ms after the tap', p1.x.toFixed(2));
  await sleep(900);
  b0.vec = { x: 0, y: 0 };
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.eval('window.__pg.setScore(400)');
  await cdp.eval('window.__pg.fastForward(1200)');
  await sleep(1700);
  await cdp.shot('f1-4-timeup');
  await sleep(5200);
  await cdp.shot('f1-4-results-2star');
  bots.splice(0).forEach((b) => b.close());
  await click('#again');
  await sleep(800);
  // 8 chefs
  await open('F1BB');
  await join('F1BB', 8, fixedMap('11')!.rows);
  await click('[data-map="11"]');
  await sleep(300);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await sleep(2100);
  await cdp.shot('f1-8-countdown');
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
  await waitFor((s) => s.countdown <= 0 && s.time > 25_000, 60_000);
  await cdp.shot('f1-8-play');
  const s8 = await snap();
  console.log('8 chefs: score', s8.score, 'streak', s8.streak, 'pairs crossing', s8.crowd.length, 'fps', s8.fps.toFixed(0));
  await cdp.eval('window.__pg.setScore(760)');
  await cdp.eval('window.__pg.fastForward(1200)');
  timers.splice(0).forEach(clearInterval);
  await sleep(1700);
  await cdp.shot('f1-8-timeup');
  await sleep(5200);
  await cdp.shot('f1-8-results-3star');
  bots.splice(0).forEach((b) => b.close());
}

export async function runDash({ cdp, bots, open, join, click, snap, waitFor }: Ctx) {
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  await open('DASH');
  await join('DASH', 2, fixedMap('1')!.rows);
  await click('[data-map="1"]');
  await sleep(300);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  bots.forEach((b) => b.startSending());
  await waitFor((s) => s.countdown <= 0 && s.time > 500, 15_000);
  const b0 = bots[0]!;
  b0.vec = { x: -1, y: 0 };
  await sleep(900);
  b0.vec = { x: 0, y: 0 };
  await sleep(400);
  b0.vec = { x: 1, y: 0 };
  await sleep(120);
  b0.b++;
  for (let i = 0; i < 4; i++) {
    await sleep(i === 0 ? 40 : 60);
    const s = await snap();
    const p = s.players.find((q) => q.id === b0.id)!;
    const cx = 96 + p.x * 108,
      cy = 106 + p.y * 108;
    await cdp.shot(`dash-${i}`, { x: Math.max(0, cx - 360), y: Math.max(0, cy - 200), width: 520, height: 330, scale: 2 });
    console.log('frame', i, 'x', p.x.toFixed(2));
  }
  b0.vec = { x: 0, y: 0 };
}

export async function runMaps({ cdp, bots, open, join, click }: Ctx) {
  for (const id of ['2', '4', '5']) {
    const room = `M${id}XX`;
    await open(room);
    await join(room, 4, fixedMap(id)!.rows);
    await click(`[data-map="${id}"]`);
    await sleep(200);
    await click('#start');
    await sleep(2800);
    await cdp.shot(`maps-${id}`);
    bots.splice(0).forEach((b) => b.close());
  }
}

export async function runReplay({ cdp, open, join, click }: Ctx) {
  await open('REPL');
  await join('REPL', 3, fixedMap('1')!.rows);
  for (let round = 0; round < 2; round++) {
    await click('[data-map="1"]');
    await sleep(200);
    await click('#start');
    await sleep(4200);
    await cdp.eval('window.__pg.fastForward(800)');
    await sleep(2600);
    await cdp.shot(`replay-results-${round}`);
    await click('#again');
    await sleep(800);
  }
  await cdp.shot('replay-lobby');
}

export async function runJuice({ cdp, bots, timers, open, join, click, snap, waitFor }: Ctx) {
  await open('JUIC');
  await join('JUIC', 4, fixedMap('1')!.rows);
  await click('[data-map="1"]');
  await click('[data-diff="easy"]');
  await sleep(200);
  await click('#start');
  await sleep(430);
  await cdp.shot('juice-iris-close');
  await sleep(330);
  await cdp.shot('juice-iris-open');
  bots.forEach((b) => b.startSending());
  timers.push(
    setInterval(async () => {
      try {
        const s = await snap();
        bots.forEach((b) => b.decide(s));
      } catch {
        /* ignore */
      }
    }, 100),
  );
  // countdown: catch "A COCINAR"
  await waitFor((s) => s.countdown > 0 && s.countdown < 900, 6000);
  await sleep(300);
  await cdp.shot('juice-go');
  let chopShot = false,
    score = 0,
    delivered = false,
    expired = false;
  const end = Date.now() + 120_000;
  while (Date.now() < end && !(chopShot && delivered && expired)) {
    const s = await snap();
    if (!chopShot && s.players.some((p) => p.cutting)) {
      chopShot = true;
      for (let i = 0; i < 3; i++) {
        await sleep(70);
        await cdp.shot(`juice-chop${i}`);
      }
    }
    if (s.score > score) {
      score = s.score;
      if (!delivered) {
        delivered = true;
        await sleep(120);
        await cdp.shot('juice-deliver');
        await sleep(500);
        await cdp.shot('juice-deliver2');
        await cdp.eval('window.__pg.forceExpire()');
        await sleep(260);
        await cdp.shot('juice-expire');
        await sleep(500);
        await cdp.shot('juice-expire2');
        expired = true;
      }
    }
    await sleep(40);
  }
  timers.splice(0).forEach(clearInterval);
}
