import { LEVEL, MODE, N, sleep, what } from '../config';
import type { Ctx } from '../setup';

export async function runPlay(c: Ctx) {
  const { cdp, state, phase } = c;
  const cleared: { level: string; sec: number }[] = [];
  let lastLevelIdx = 0;
  if (what === 'shots') {
    // mid-level pictures first (the camera, the rope in Encadenados, the group at the wall)
    for (let i = 0; i < 60 && ((await state())?.tick ?? 0) < 420; i++) await sleep(250);
    await cdp.shot(`play-${MODE}-${N}p-t7`);
    await sleep(2500);
    await cdp.shot(`play-${MODE}-${N}p-t10`);
  }
  const t0 = Date.now();
  const need = Number(process.env.CLEAR ?? 2); // levels the bots must clear before the run is closed by hand
  while (cleared.length < need && Date.now() - t0 < 240_000) {
    await sleep(400);
    const st = await state();
    if (!st) continue;
    if (process.env.V && Date.now() % 4000 < 420)
      console.log(
        `  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${st.sess} ${st.level} tick ${st.tick} cd ${st.countdownMs} lives ${st.lives} ${st.players.map((p: any) => `${p.slot}:${(p.x / 48).toFixed(1)},${(p.y / 48).toFixed(1)}${p.mode[0]}`).join(' ')}`,
      );
    if (st.levelIndex > lastLevelIdx || st.sess === 'between') {
      if (st.sess === 'between' && cleared.length === st.levelIndex) {
        cleared.push({ level: st.level, sec: st.timeSec });
        console.log(`  cleared ${st.level} in ${st.timeSec.toFixed(1)} s, deaths ${st.deaths}`);
        if (what === 'shots') await cdp.shot(`cleared-${MODE}-${N}p-${st.level}`);
      }
      lastLevelIdx = st.levelIndex;
    }
  }
  const fps = await cdp.eval<{ avg: number; p5: number; worst: number }>(
    `new Promise((res) => { const ts = []; let n = 0; const f = (t) => { ts.push(t); if (++n < 300) requestAnimationFrame(f); else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res({ avg: 1000 / (d.reduce((a, b) => a + b, 0) / d.length), p5: 1000 / d[Math.floor(d.length * 0.95)], worst: d[d.length - 1] }); } }; requestAnimationFrame(f); })`,
  );
  const perf = await cdp.eval<any>('window.__pg.obstPerf()');
  console.log(
    `RESULT ${what} n=${N} ${MODE} level ${LEVEL}: cleared ${cleared.length}/${need}`,
    JSON.stringify(cleared),
    'fps',
    JSON.stringify(fps),
    'step ms',
    JSON.stringify(perf),
  );
  if (cleared.length < need) c.code = 1;
  if (what === 'shots' || process.env.RESULTS) {
    await sleep(1500);
    await cdp.eval('window.__pg.obstWin && 0');
    // close the run by hand: win whatever is left, to see the results screen
    for (let i = 0; i < 6 && (await phase()) === 'playing'; i++) {
      const st = await state();
      if (st?.sess === 'playing') await cdp.eval('window.__pg.obstWin()');
      await sleep(5200);
      if ((await phase()) === 'playing' && what === 'shots') await cdp.shot(`banner-${N}p-${i}`);
    }
    for (let i = 0; i < 20 && (await phase()) !== 'results'; i++) await sleep(500);
    await sleep(3800);
    await cdp.shot(`results-${N}p`);
  }
}
