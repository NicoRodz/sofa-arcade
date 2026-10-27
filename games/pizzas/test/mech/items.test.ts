// A loose item on a belt stops before a shut door, a flame or a bridge, and goes on when the door opens.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls } from '../../sim/overcooked';
import { BELT_STEP_MS } from '../../sim/surfaces/config';
import { FIRE, setTile } from '../../sim/mech/oil/state';

const rows = (mid: string) => [
  '################',
  '#1.2....K.P...E#',
  '#S..S..........#',
  '#..............#',
  `#.→→${mid}${'.'.repeat(9)}#`,
  '#..............#',
  '#.O............#',
  '#..............#',
  '################',
];
const idle = new Map<number, Controls>();
const item = (g: ReturnType<typeof createGame>) => {
  g.floor.push({ id: 1, tx: 2, ty: 4, item: 'raw0', kind: 'dropped', team: 0, by: null, bornAt: 0, expiresAt: Infinity });
  return g.floor[0]!;
};
const run = (g: ReturnType<typeof createGame>, k: number) => {
  for (let i = 0; i < k; i++) tick(g, idle);
};
const TICKS = Math.ceil((BELT_STEP_MS / 1000) * 60) * 3;

describe('belt items and the mechanics', () => {
  it('a shut door stops the item at its edge; when the door opens it rides on', () => {
    const g = createGame({ rows: rows('→D'), n: 1, mech: { gate: true }, surfaces: true, countdownMs: 0 });
    addPlayer(g, 1, 0, 0);
    const f = item(g);
    run(g, TICKS);
    expect(f.tx).toBe(4); // the last belt tile before D at x = 5
    g.mech!.gate!.open = true;
    run(g, 2);
    g.mech!.gate!.open = true;
    for (let i = 0; i < TICKS; i++) {
      g.mech!.gate!.open = true;
      tick(g, idle);
    }
    expect(f.tx).toBeGreaterThan(4);
  });
  it('a flame on the next tile stops it too', () => {
    const g = createGame({ rows: rows('→.'), n: 1, mech: { oil: true }, surfaces: true, countdownMs: 0 });
    addPlayer(g, 1, 0, 0);
    setTile(g, 4 * 16 + 5, FIRE, 600);
    const f = item(g);
    run(g, TICKS);
    expect(f.tx).toBe(4);
  });
});
