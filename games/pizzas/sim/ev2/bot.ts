// EVENTS_V2, bots: the two jobs the events add. Test and tooling support (tools/carta-larga/bot.ts calls it): nothing in the game imports this.
// Blackout: the first HOLD_CHEFS chefs walk to the light board and hold B. Cake: the first chef with free hands walks to the candle drawer and presses A.
import { DIRS, isFloor } from '../maps';
import type { Controls, Game, Player } from '../round/state';
import { BOARD_RADIUS, HOLD_CHEFS, near, type Spot } from './state';

/** First step (unit vector) of a shortest path over floor tiles from the chef to a floor tile within reach of the spot; null when already there. */
function toward(g: Game, p: Player, s: Spot): { x: number; y: number } | null {
  if (near(p, s, BOARD_RADIUS - 0.3)) return null;
  const goal = (x: number, y: number) => Math.hypot(x + 0.5 - (s.tx + 0.5), y + 0.5 - (s.ty + 0.5)) <= 1.2;
  const from: [number, number] = [Math.floor(p.x), Math.floor(p.y)];
  const prev = new Map<string, string>([[from.join(), '']]);
  const queue: [number, number][] = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy,
        k = `${nx},${ny}`;
      if (!isFloor(g.grid, nx, ny) || prev.has(k)) continue;
      prev.set(k, `${x},${y}`);
      if (goal(nx, ny)) {
        let cur = k;
        while (prev.get(prev.get(cur)!) !== '') cur = prev.get(cur)!;
        const [sx, sy] = cur.split(',').map(Number) as [number, number];
        const ux = sx + 0.5 - p.x,
          uy = sy + 0.5 - p.y,
          l = Math.hypot(ux, uy) || 1;
        return { x: ux / l, y: uy / l };
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}

/** What this chef does for the events with presence now, or null (it goes on with its kitchen). `rank` = its place among the chefs. */
export function ev2Bot(g: Game, p: Player, rank: number, tickNo: number): Controls | null {
  const e = g.ev2;
  if (!e || p.ghost) return null;
  if (g.mid?.dark && e.board && rank < Math.min(HOLD_CHEFS[g.difficulty], g.players.size)) {
    const step = toward(g, p, e.board);
    return step ? { ...step, a: 0, b: false } : { x: 0, y: 0, a: 0, b: true };
  }
  const k = e.cake;
  if (k && !k.closed && !k.candled && !p.item && rank === 0) {
    const step = toward(g, p, k.drawer);
    return step ? { ...step, a: 0, b: false } : { x: 0, y: 0, a: tickNo % 4 === 0 ? 1 : 0, b: false };
  }
  return null;
}
