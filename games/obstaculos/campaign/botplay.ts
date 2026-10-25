// Plays a level in the real sim with ObstBot (tests and tools). The bot knows walls, gaps, spikes and the tower + hand; it does not throw, swing or press plates.
import { ObstBot } from '../bot';
import { ObstSession } from '../session';
import type { WorldId } from '../sim/campaign';
import type { ObstEvent } from '../sim/state';
import { snapshot } from '../sim/world';
import type { GameMode, LevelDef } from '../types';

// `events`: when given, every obst.* event of the run is pushed into it (the A5 tests count obst.ice, obst.wind, obst.enemy ... to show a dynamic was really in play).
export function playWithBots(def: LevelDef, n: number, mode: GameMode, maxSec = 120, campaign?: { world: WorldId }, events?: ObstEvent[]) {
  const slots = Array.from({ length: n }, (_, i) => i);
  const s = new ObstSession({ mode, difficulty: 'normal', level: 0, seed: 1, slots, levels: [def], ...(campaign ? { campaign } : {}) });
  const bots = slots.map((i) => new ObstBot(i));
  const taps = slots.map(() => [0, 0]);
  for (let f = 0; f < maxSec * 60 && s.world.status === 'playing'; f++) {
    const snap = snapshot(s.world);
    const view = { tick: s.world.tick, grid: s.world.grid, players: snap.players, goal: snap.goal };
    for (const i of slots) {
      const o = bots[i]!.decide(view);
      if (o.jump) taps[i]![0]!++;
      if (o.grab) taps[i]![1]!++;
      s.receive(i, { x: o.x, y: o.y, presses: [taps[i]![0]!, taps[i]![1]!] });
    }
    const ev = s.advance(1000 / 60);
    if (events) events.push(...ev);
  }
  return s;
}
