import { WebSocket } from 'ws';
import { N, sleep } from '../config';
import type { Ctx } from '../setup';

export async function runSoak(c: Ctx) {
  const { cdp, phones, click, key, state, phase } = c;
  const secs = Number(process.env.SOAK_S ?? 300);
  const t0 = Date.now();
  const mem: number[] = [];
  let rounds = 1,
    lastPhase = 'playing',
    worstP95 = 0,
    worstMax = 0,
    minFps = 999,
    wins = 0,
    lastWin = Date.now();
  const levelsSeen = new Set<string>();
  while (Date.now() - t0 < secs * 1000) {
    await sleep(2000);
    const ph = await phase();
    if (ph === 'results' && lastPhase !== 'results') {
      await sleep(2500);
      await click('#again');
      await sleep(900);
      await click('#start');
      rounds++;
      for (let i = 0; i < 40 && (await phase()) !== 'playing'; i++) {
        await sleep(300);
        await key('Enter');
      }
    }
    lastPhase = ph;
    // the lagging bots rarely clear a level on their own: every SOAK_WIN s the level is closed by hand so the transitions (new world, new view, results, new round) are part of the soak
    const cur = await state();
    if (cur) levelsSeen.add(`${rounds}:${cur.levelIndex}:${cur.level}`);
    if (cur?.sess === 'playing' && Date.now() - lastWin > Number(process.env.SOAK_WIN ?? 40) * 1000) {
      await cdp.eval('window.__pg.obstWin()');
      wins++;
      lastWin = Date.now();
    }
    const perf = await cdp.eval<any>('window.__pg.obstPerf()');
    worstP95 = Math.max(worstP95, perf.p95);
    worstMax = Math.max(worstMax, perf.max);
    if (perf.fps) minFps = Math.min(minFps, perf.fps);
    const heap = await cdp.eval<number>('(performance.memory && performance.memory.usedJSHeapSize) || 0');
    mem.push(heap);
    const st = await state();
    if (mem.length % 10 === 0)
      console.log(
        `  t=${((Date.now() - t0) / 1000).toFixed(0)}s phase ${ph} level ${st?.level} idx ${st?.levelIndex} heap ${(heap / 1e6).toFixed(0)} MB step p95 ${perf.p95.toFixed(2)} ms max ${perf.max.toFixed(2)} fps ${perf.fps?.toFixed(0)}`,
      );
  }
  const first = mem[Math.floor(mem.length * 0.2)] ?? 0,
    last = mem[mem.length - 1] ?? 0;
  console.log(
    `RESULT soak ${secs}s n=${N}: rounds ${rounds}, levels seen ${levelsSeen.size}, hand-cleared ${wins}, step p95 worst ${worstP95.toFixed(2)} ms, max ${worstMax.toFixed(2)} ms, min fps ${minFps.toFixed(0)}, heap ${(first / 1e6).toFixed(0)} -> ${(last / 1e6).toFixed(0)} MB, page errors ${cdp.errors.length}, ws closed ${phones.filter((p) => p.ws.readyState !== WebSocket.OPEN).length}`,
  );
  if (cdp.errors.length) c.code = 1;
}
