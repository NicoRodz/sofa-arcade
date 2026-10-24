import { describe, expect, it } from 'vitest';
import { TILE, ZOOM_MAX, ZOOM_MIN, buildGrid, parseLevelStrict, type Rect } from '@party/shared/obstaculos';
import { LEVEL_01 } from '../../../../../shared/games/obstaculos/levels';
import {
  BOTTOM_STRIP, StragglerTracker, VIEW_H, VIEW_W, arrowPoint, chooseFocus, computeCamera, progressAt, progressField, type CamInput, type CamPlayer, type CamState,
} from './camera';

const P = (id: number, x: number, progress: number, o: Partial<CamPlayer> = {}): CamPlayer => ({ id, x, y: 500, vx: 0, progress, active: true, visibleCheck: true, ...o });
// level big enough that the clamp never interferes unless a test wants it to
const W_ = 20000, H_ = 3000;
const input = (players: CamPlayer[], extra: Partial<CamInput> = {}): CamInput => ({ players, boundsW: W_, boundsH: H_, ...extra });
const settle = (inp: CamInput, from: CamState | null, seconds: number): CamState => {
  let s = from;
  for (let i = 0; i < seconds * 60; i++) s = computeCamera(inp, s, 1 / 60).state;
  return s!;
};

describe('computeCamera: focus', () => {
  it('with two players frames both, zoomed between the limits', () => {
    const r = computeCamera(input([P(0, 5000, 30), P(1, 5600, 28)]), null, 0);
    expect(r.focus.sort()).toEqual([0, 1]);
    expect(r.state.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(r.state.zoom).toBeLessThanOrEqual(ZOOM_MAX);
    expect(r.state.cx).toBeCloseTo(5300, 0);
    expect(r.offscreen).toEqual([]);
  });

  it('keeps everybody when the group fits at the minimum zoom, and zooms out to do it', () => {
    const ps = Array.from({ length: 8 }, (_, i) => P(i, 4000 + i * 300, 80 - i * 10)); // 2100 px apart + padding: wider than zoom 1, narrower than zoom 0.6
    const r = computeCamera(input(ps), null, 0);
    expect(r.focus).toHaveLength(8);
    expect(r.state.zoom).toBeLessThan(0.85);
    expect(r.state.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(r.offscreen).toEqual([]);
  });

  it('leaves a far straggler out of the focus and reports it as off camera', () => {
    const ps = [P(0, 8000, 20), P(1, 8200, 22), P(2, 8400, 24), P(3, 8100, 26), P(4, 500, 99)];
    const r = computeCamera(input(ps), null, 0);
    expect(r.focus).not.toContain(4);
    expect(r.focus.sort()).toEqual([0, 1, 2, 3]);
    expect(r.offscreen.map((o) => o.id)).toEqual([4]);
    expect(r.offscreen[0]!.dirX).toBeLessThan(0); // it is to the left
    expect(r.median).toBe(2); // five players sorted by progress: the third one
  });

  it('the front-runner who goes ahead alone is left out the same way', () => {
    const ps = [P(0, 500, 90), P(1, 600, 88), P(2, 700, 86), P(3, 800, 84), P(4, 12000, 1)];
    const r = computeCamera(input(ps), null, 0);
    expect(r.focus).not.toContain(4);
    expect(r.offscreen.map((o) => o.id)).toEqual([4]);
    expect(r.offscreen[0]!.dirX).toBeGreaterThan(0);
  });

  it('the median is by progress (BFS from the goal), not by slot order', () => {
    const ps = [P(0, 100, 50), P(1, 200, 10), P(2, 300, 60), P(3, 400, 40), P(4, 500, 20)];
    const r = computeCamera(input(ps), null, 0);
    expect(r.median).toBe(3); // progress order: 1(10) 4(20) 3(40) 0(50) 2(60); by slot order it would be 2
  });

  it('players that are in a bubble or dead do not pull the camera', () => {
    const r = computeCamera(input([P(0, 5000, 20), P(1, 5200, 22), P(2, 100, 90, { active: false, visibleCheck: false })]), null, 0);
    expect(r.focus.sort()).toEqual([0, 1]);
    expect(r.offscreen).toEqual([]);
  });

  it('chooseFocus returns the largest contiguous run that holds the median', () => {
    const sorted = [P(0, 0, 1), P(1, 100, 2), P(2, 200, 3), P(3, 5000, 4), P(4, 5100, 5)];
    // median index 2: runs containing it that fit in ~ (1920 / .6 - 288) = 2912 px: [0..2] only (3 is 4800 px away)
    expect(chooseFocus(sorted, 2, VIEW_W, VIEW_H).map((p) => p.id)).toEqual([0, 1, 2]);
    // median index 3: run [3..4] (a run reaching back to 2 would be 4900 px wide)
    expect(chooseFocus(sorted, 3, VIEW_W, VIEW_H).map((p) => p.id)).toEqual([3, 4]);
  });
});

describe('computeCamera: zones, clamp and springs', () => {
  it('a camera zone holding the median fixes the framing on the room', () => {
    const zone: Rect = { x: 10, y: 0, w: 64, h: 18 }; // like level 8: 64 x 18 tiles
    const ps = [P(0, 12 * TILE, 10), P(1, 14 * TILE, 12), P(2, 16 * TILE, 14), P(3, 70 * TILE, 8)];
    const r = computeCamera(input(ps, { zones: [zone], boundsW: 100 * TILE, boundsH: 18 * TILE }), null, 0);
    expect(r.zone).toBe(0);
    expect(r.state.cx).toBeCloseTo((10 + 32) * TILE, 0);
    expect(r.state.zoom).toBeCloseTo(Math.max(ZOOM_MIN, Math.min(1, VIEW_W / (64 * TILE))), 3);
    expect(r.rect.w).toBeGreaterThanOrEqual(64 * TILE - 1); // the whole room fits
  });

  it('a zone that does not hold the median changes nothing', () => {
    const r = computeCamera(input([P(0, 500, 10), P(1, 600, 12)], { zones: [{ x: 100, y: 0, w: 20, h: 10 }] }), null, 0);
    expect(r.zone).toBe(-1);
  });

  it('stays inside the level horizontally', () => {
    const r = computeCamera({ players: [P(0, 50, 10), P(1, 90, 11)], boundsW: 60 * TILE, boundsH: 3000 }, null, 0);
    expect(r.rect.x).toBeGreaterThanOrEqual(-0.001);
    const r2 = computeCamera({ players: [P(0, 2850, 10), P(1, 2870, 11)], boundsW: 60 * TILE, boundsH: 3000 }, null, 0);
    expect(r2.rect.x + r2.rect.w).toBeLessThanOrEqual(60 * TILE + 0.001);
  });

  it('a level shorter than the view sits near the bottom, with a strip of ground under it', () => {
    const r = computeCamera({ players: [P(0, 1000, 10, { y: 300 }), P(1, 1100, 11, { y: 300 })], boundsW: 60 * TILE, boundsH: 14 * TILE }, null, 0);
    const bottom = r.rect.y + r.rect.h;
    expect(bottom).toBeCloseTo(14 * TILE + BOTTOM_STRIP / r.state.zoom, 1);
  });

  it('zooms out faster than it zooms in (omega 5 vs 2)', () => {
    const near = input([P(0, 5000, 10), P(1, 5100, 12)]);
    const far = input([P(0, 5000, 10), P(1, 7600, 12)]); // needs zoom ~0.66
    const s0 = computeCamera(near, null, 0).state;
    const out = settle(far, s0, 0.5).zoom;
    const sFar = computeCamera(far, null, 0).state;
    const back = settle(near, sFar, 0.5).zoom;
    const outProgress = (s0.zoom - out) / (s0.zoom - sFar.zoom);
    const inProgress = (back - sFar.zoom) / (s0.zoom - sFar.zoom);
    expect(outProgress).toBeGreaterThan(inProgress + 0.2);
  });

  it('is deterministic: same inputs, same state (no Date, no random)', () => {
    const seq = (): CamState => {
      let s: CamState | null = null;
      for (let i = 0; i < 300; i++) s = computeCamera(input([P(0, 5000 + i * 7, 10, { vx: 330 }), P(1, 5300 + i * 5, 12, { vx: 250 }), P(2, 4800 + i * 9, 14, { vx: 330 })]), s, 1 / 60).state;
      return s!;
    };
    expect(seq()).toEqual(seq());
  });

  it('looks ahead in the direction the group moves, but only by a fraction of the view', () => {
    const still = settle(input([P(0, 5000, 10), P(1, 5100, 12)]), null, 2);
    const run = settle(input([P(0, 5000, 10, { vx: 330 }), P(1, 5100, 12, { vx: 330 })]), null, 2);
    expect(run.cx).toBeGreaterThan(still.cx + 50);
    expect(run.cx - still.cx).toBeLessThan(0.15 * VIEW_W / 2 + 1);
  });
});

describe('StragglerTracker', () => {
  it('reports a player after the time limit and forgets the ones back in view', () => {
    const t = new StragglerTracker();
    for (let i = 0; i < 119; i++) expect(t.update(1 / 60, [3], 2)).toEqual([]);
    expect(t.update(1 / 60, [3], 2)).toEqual([3]); // 2 s
    expect(t.seconds(3)).toBeCloseTo(2, 5);
    t.update(1 / 60, [], 2);
    expect(t.seconds(3)).toBe(0);
  });
  it('counts each player on their own and reset clears one', () => {
    const t = new StragglerTracker();
    t.update(1, [1, 2], 3); t.update(1, [2], 3);
    expect(t.seconds(1)).toBe(0);
    expect(t.seconds(2)).toBe(2);
    t.reset(2);
    expect(t.seconds(2)).toBe(0);
  });
  it('the limit comes from the difficulty: 1 s easy, 3 s hard', () => {
    const easy = new StragglerTracker(), hard = new StragglerTracker();
    expect(easy.update(1, [0], 1)).toEqual([0]);
    expect(hard.update(1, [0], 3)).toEqual([]);
  });
});

describe('arrowPoint', () => {
  it('puts the arrow on the border, inset, along the direction', () => {
    const a = arrowPoint(-1, 0, 1920, 1080, 70);
    expect(a.x).toBeCloseTo(70, 5); expect(a.y).toBeCloseTo(540, 5);
    const b = arrowPoint(0, 1, 1920, 1080, 70);
    expect(b.x).toBeCloseTo(960, 5); expect(b.y).toBeCloseTo(1010, 5);
    const c = arrowPoint(Math.SQRT1_2, -Math.SQRT1_2, 1920, 1080, 70);
    expect(c.y).toBeCloseTo(70, 5); // the shorter axis wins: the top border
    expect(c.x).toBeLessThan(1850);
  });
});

describe('progressField (BFS from the goal)', () => {
  const p = parseLevelStrict(LEVEL_01);
  const grid = buildGrid(p, 'chain');
  const goal = p.markers.goal[0]!, spawn = p.markers.spawn[0]!;
  const f = progressField(grid, goal);

  it('is 0 at the goal and grows with the walking distance', () => {
    expect(f[goal.y * grid.w + goal.x]).toBe(0);
    expect(progressAt(f, grid, (spawn.x + 0.5) * TILE, (spawn.y + 0.5) * TILE)).toBeGreaterThan(progressAt(f, grid, (35 + 0.5) * TILE, (8 + 0.5) * TILE)); // spawn is farther than the checkpoint
    expect(progressAt(f, grid, (35 + 0.5) * TILE, (8 + 0.5) * TILE)).toBeGreaterThan(progressAt(f, grid, (52 + 0.5) * TILE, 7.5 * TILE));
  });
  it('cells inside solid rock are not reachable and sort after everything reachable', () => {
    expect(f[13 * grid.w + 5]).toBeGreaterThanOrEqual(1_000_000); // a tile of the floor
    expect(Math.max(...Array.from(f).filter((v) => v < 1_000_000))).toBeLessThan(1_000_000);
  });
  it('clamps positions outside the grid', () => {
    expect(() => progressAt(f, grid, -500, -500)).not.toThrow();
    expect(() => progressAt(f, grid, 99999, 99999)).not.toThrow();
  });
});
