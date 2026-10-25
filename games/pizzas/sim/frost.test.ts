import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick } from './overcooked';
import { FIXED_MAPS } from './maps';
import { surfaceAt } from './surfaces/physics';

describe('frost: the whole floor is ice for a while', () => {
  it('while it is on every floor tile is ice (belts included) and the stick only steers the slide; it ends by itself', () => {
    const g = createGame({ rows: FIXED_MAPS[0]!.rows, events: true, seed: 1 });
    addPlayer(g, 1, 0, 0);
    const p = g.players.get(1)!;
    expect(surfaceAt(g, p.x, p.y)).toBeNull();
    g.mid!.kind = 'frost';
    g.mid!.phase = 'announced';
    g.mid!.startAt = g.time;
    tick(g, new Map());
    expect(g.mid!.frost).toBe(true);
    expect(g.surf).not.toBeNull();
    expect(surfaceAt(g, p.x, p.y)).toEqual({ kind: 'ice' });
    g.time = g.mid!.endAt + 1;
    tick(g, new Map());
    expect(g.mid!.frost).toBe(false);
    expect(surfaceAt(g, p.x, p.y)).toBeNull();
  });
});
