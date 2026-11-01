// The FEEL of the numbers A5 assumed, measured with bots on the real sim (feelkit.ts; tools/s1-feel.ts prints the full tables). These tests lock the conclusions written in tuning.ts
// ("A6 feel"): if someone changes the wind, the shove or the slide, the verdict below moves and says so.
import { describe, expect, it } from 'vitest';
import { campaignParams } from './rules/campaign';
import { anchorTrial, enemyLevel, playBots, windLevel } from './testkit/feelkit';

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const phases = (n: number, every: number) => Array.from({ length: n }, (_, k) => k * every);

describe('wind 140 px/s (params(2).windPxPerSec)', () => {
  const trial = (gap: number, px: number) =>
    phases(6, 30).map((d) =>
      playBots(windLevel(gap, -1), 'glacier', d, 90, (w) => {
        w.camp!.windPxPerSec = px;
      }),
    );
  it('a 3-tile gap against the wind is never a problem (no deaths in any phase of the gust); a 5-tile one costs about a death per crossing unless you wait for the calm (the cost of ignoring the warning)', () => {
    expect(campaignParams(2).windPxPerSec).toBe(140);
    const easy = trial(3, 140),
      hard = trial(5, 140),
      calm = trial(5, 0);
    expect(easy.every((r) => r.cleared && r.deaths === 0)).toBe(true);
    expect(calm.every((r) => r.cleared && r.deaths === 0)).toBe(true); // without wind the same 5-tile pit is clean: the deaths below are the wind's
    expect(hard.every((r) => r.cleared)).toBe(true); // everybody gets across in the end
    expect(mean(hard.map((r) => r.deaths))).toBeGreaterThan(0.4);
    expect(mean(hard.map((r) => r.deaths))).toBeLessThan(2);
    expect(mean(hard.map((r) => r.sec))).toBeLessThan(mean(calm.map((r) => r.sec)) + 3); // and the detour costs seconds, not the level
  }, 120_000);
});

describe('soft enemies: shove 360 px/s (params(2).enemyPushPxPerSec)', () => {
  const trial = (px: number, maxSec: number) =>
    phases(4, 17).map((d) =>
      playBots(enemyLevel(), 'forest', d, maxSec, (w) => {
        w.camp!.enemyPushPxPerSec = px;
      }),
    );
  it('at 360 two bots walk through two beetles in about 8 s (p90 10 s) with shoves but no death and no heart lost; the wall is not far: at 450 they never get through', () => {
    expect(campaignParams(2).enemyPushPxPerSec).toBe(360);
    const ok = trial(360, 40);
    expect(ok.every((r) => r.cleared)).toBe(true);
    expect(mean(ok.map((r) => r.sec))).toBeLessThan(14);
    expect(ok.every((r) => r.deaths === 0 && r.heartsLost === 0)).toBe(true);
    expect(mean(ok.map((r) => r.shoves))).toBeGreaterThan(3);
    const wall = trial(450, 30);
    expect(wall.some((r) => r.cleared)).toBe(false); // above ~400 px/s a bot that does not stomp is walled in by the patrol: S2 must keep a way around every beetle
  }, 180_000);
});

describe('anchor slide 0.5 tile/s (params(2).slideTilesPerSec)', () => {
  it('an unplanted anchor 2 tiles from the edge takes about 4 s to be dragged over: a partner that plants within 2 s of the rope going taut always saves it; at 2 tiles/s the same reaction never does', () => {
    expect(campaignParams(2).slideTilesPerSec).toBe(0.5);
    const w = anchorTrial(0.5, 2, -1).window;
    expect(w).toBeGreaterThan(3.5);
    expect(w).toBeLessThan(5);
    for (const react of [0.5, 1, 1.5, 2])
      for (const k of [0, 9, 18]) expect(anchorTrial(0.5, 2, react, k).stopped, `react ${react} offset ${k}`).toBe(true);
    expect(anchorTrial(2, 2, 2, 0).stopped).toBe(false);
    expect(anchorTrial(0.5, 5, -1).window).toBe(Infinity); // 5 tiles back there is no danger at all
  }, 60_000);
});
