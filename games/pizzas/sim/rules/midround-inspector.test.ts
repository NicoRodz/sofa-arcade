import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, type Game } from '../overcooked';
import { ACTIVE_MS, INSPECTOR_BONUS, dirtyPlates, eventPool } from './midround';
import { GRACE_MS } from './burn';
import { MIRRORS } from '../../test/golden/mirror-bot';
import { mk, force, run, runTo } from './midround.kit';

describe('Corte de luz: the ovens are off for 10 s', () => {
  it('an oven that is cooking makes no progress while the lights are out, and goes on afterwards', () => {
    const { g } = mk({ kind: 'blackout', startAt: 3000 });
    const oven = g.stations.find((s) => s.kind === 'pot')!;
    oven.inputs = [0, 1];
    oven.progress = 0;
    run(g, 2900);
    const before = oven.progress;
    expect(before).toBeGreaterThan(0.3);
    run(g, 1500);
    expect(g.mid!.dark).toBe(true);
    const frozen = oven.progress;
    run(g, 8000);
    expect(oven.progress).toBeCloseTo(frozen, 6);
    run(g, 1500);
    expect(g.mid!.dark).toBe(false);
    run(g, 1000);
    expect(oven.progress).toBeGreaterThan(frozen);
  });
  it('with the burn rules on, the grace time of a ready pizza does not run in the dark', () => {
    const { g, log } = mk({ kind: 'blackout', startAt: 3000, burn: true });
    const oven = g.stations.find((s) => s.kind === 'pot')!;
    runTo(g, 2000);
    oven.inputs = [0, 1];
    oven.progress = 1;
    oven.done = true;
    oven.readyAt = g.time;
    runTo(g, 3000 + ACTIVE_MS.blackout - 200); // 2 s before the start, ready: 1 s of grace spent, then the whole blackout
    expect(oven.burnt).toBeUndefined();
    runTo(g, 2000 + GRACE_MS.normal + ACTIVE_MS.blackout - 600); // ... still not burnt: the dark added its 10 s
    expect(oven.burnt).toBeUndefined();
    runTo(g, 2000 + GRACE_MS.normal + ACTIVE_MS.blackout + 400);
    expect(oven.burnt).toBe(true);
    expect(log['oven:burnt']).toHaveLength(1);
  });
  it('without the event the same pizza burns at the grace time (the test above is not vacuous)', () => {
    const { g } = mk({ events: false, burn: true });
    const oven = g.stations.find((s) => s.kind === 'pot')!;
    oven.inputs = [0, 1];
    oven.progress = 1;
    oven.done = true;
    oven.readyAt = g.time;
    run(g, GRACE_MS.normal + 400);
    expect(oven.burnt).toBe(true);
  });
});

describe('Inspector: +100 when no dirty plate is left at the end', () => {
  it('only on a map with plates to wash; the verdict comes when it ends', () => {
    const { g, log } = mk({ kind: 'inspector', startAt: 3000, map: '13', n: 2 });
    expect(g.finitePlates).toBe(true);
    runTo(g, 3000 + ACTIVE_MS.inspector - 500);
    expect(log['event:inspector']).toBeUndefined();
    runTo(g, 3000 + ACTIVE_MS.inspector + 200);
    expect(log['event:inspector']).toHaveLength(1);
    expect(log['event:inspector']![0]!.p).toEqual({ passed: true, points: 100 });
    expect(g.score).toBe(100);
    expect(g.teams[0]!.gross).toBe(100);
  });
  it('a dirty plate in the return window, in the sink, on a counter or in a chef hands spoils it', () => {
    const spoil: [string, (g: Game) => void][] = [
      [
        'return window',
        (g) => {
          g.stations.find((s) => s.kind === 'dirty')!.count = 1;
        },
      ],
      [
        'sink',
        (g) => {
          g.stations.find((s) => s.kind === 'sink')!.count = 1;
        },
      ],
      [
        'counter',
        (g) => {
          g.stations.find((s) => s.kind === 'counter')!.item = 'dirty';
        },
      ],
      [
        'hands',
        (g) => {
          g.players.get(1)!.item = 'dirty';
        },
      ],
    ];
    for (const [where, f] of spoil) {
      const { g, log } = mk({ kind: 'inspector', startAt: 3000, map: '13' });
      f(g);
      expect(dirtyPlates(g, 0), where).toBe(1);
      runTo(g, 3000 + ACTIVE_MS.inspector + 200);
      expect(log['event:inspector']![0]!.p, where).toEqual({ passed: false, points: 0 });
      expect(g.score, where).toBe(0);
    }
  });
  it('washing them during the event earns it', () => {
    const { g, log } = mk({ kind: 'inspector', startAt: 3000, map: '13' });
    g.stations.find((s) => s.kind === 'dirty')!.count = 2;
    run(g, 5000);
    for (const s of g.stations) if (s.kind === 'dirty') s.count = 0; // (the washing itself is tested in the base rules)
    runTo(g, 3000 + ACTIVE_MS.inspector + 200);
    expect(log['event:inspector']![0]!.p.passed).toBe(true);
  });
  it('versus: each team is judged on its own kitchen and the bonus goes through k (no real versus map has plates to wash, so a sink and a return are drawn into V1)', () => {
    const rows = MIRRORS.v1.rows.map((r, y) => (y === 8 ? `#UL${r.slice(3, 13)}LU#` : r)); // the bottom wall: return window and sink in each kitchen, twins under the reflection
    const g = createGame({
      rows,
      spawns: [
        [2, 5],
        [2, 6],
        [5, 5],
        [13, 5],
        [13, 6],
        [10, 5],
      ],
      teams: [{ playerIds: [1, 2, 3] }, { playerIds: [4, 5] }],
      events: true,
      seed: 4,
    });
    [
      [1, 2, 3],
      [4, 5],
    ].forEach((ids) => ids.forEach((id, r) => addPlayer(g, id, r, r)));
    expect(g.finitePlates).toBe(true);
    expect(eventPool(g)).toContain('inspector');
    force(g, 'inspector', 3000);
    g.stations.find((s) => s.kind === 'sink' && s.owner === 0)!.count = 1; // a dirty plate waits in kitchen 0 only
    run(g, 3000 + ACTIVE_MS.inspector + 300);
    expect(g.teams[1]!.k).toBeGreaterThan(1); // the small team of a 3 v 2
    expect(g.teams.map((t) => t.score)).toEqual([0, Math.round(INSPECTOR_BONUS * g.teams[1]!.k)]);
    expect(g.teams[1]!.gross).toBe(INSPECTOR_BONUS);
  });
});
