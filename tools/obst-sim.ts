// Headless run of the expedition with scripted explorers: usage: npx tsx tools/obst-sim.ts <level> <n> <chain|free> [difficulty] [maxSeconds]
import { ObstBot, ObstSession, snapshot, LEVELS, type GameMode } from '@pichi/game-obstaculos';
import type { Difficulty } from '@pichi/core/difficulty';

export function playLevel(levelIdx: number, n: number, mode: GameMode, difficulty: Difficulty = 'normal', maxSec = 240, verbose = false) {
  const slots = Array.from({ length: n }, (_, i) => i);
  const s = new ObstSession({ mode, difficulty, level: 0, seed: 1, slots, levels: [LEVELS[levelIdx - 1]!] });
  const bots = slots.map((i) => new ObstBot(i));
  const counters = slots.map(() => [0, 0]);
  const frames = Math.round(maxSec * 60);
  const events: string[] = [];
  for (let f = 0; f < frames && s.status !== 'between' && !s.over; f++) {
    const snap = snapshot(s.world);
    const view = { tick: s.world.tick, grid: s.world.grid, players: snap.players, goal: snap.goal };
    for (const i of slots) {
      const o = bots[i]!.decide(view);
      if (o.jump) counters[i]![0]!++;
      if (o.grab) counters[i]![1]!++;
      s.receive(i, { x: o.x, y: o.y, presses: [counters[i]![0]!, counters[i]![1]!] });
    }
    const ev = s.advance(1000 / 60);
    for (const e of ev)
      if (['obst.death', 'obst.bubble', 'obst.checkpoint', 'obst.levelClear'].includes(e.name))
        events.push(`${(s.world.tick / 60).toFixed(1)}s ${e.name} ${JSON.stringify(e.data)}`);
    if (verbose && f % 60 === 0)
      console.log(
        (f / 60).toFixed(0),
        snap.players.map((p) => `${p.slot}:${(p.x / 48).toFixed(1)},${(p.y / 48).toFixed(1)}${p.planted ? 'P' : ''}`).join(' '),
      );
  }
  return {
    status: s.world.status,
    tick: s.world.tick,
    cleared: s.world.status === 'cleared',
    result: s.world.result,
    events,
    world: s.world,
  };
}

if (process.argv[1]?.endsWith('obst-sim.ts')) {
  const [lv, n, mode, diff, max] = [
    Number(process.argv[2] ?? 1),
    Number(process.argv[3] ?? 2),
    (process.argv[4] ?? 'chain') as GameMode,
    (process.argv[5] ?? 'normal') as Difficulty,
    Number(process.argv[6] ?? 240),
  ];
  const r = playLevel(lv, n, mode, diff, max, !!process.env.V);
  console.log(`level ${lv} n=${n} ${mode} ${diff}: ${r.status} in ${(r.tick / 60).toFixed(1)}s`, JSON.stringify(r.result));
  console.log(r.events.slice(0, 30).join('\n'));
}
