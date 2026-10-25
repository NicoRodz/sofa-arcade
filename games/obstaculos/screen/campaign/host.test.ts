// What the campaign needs from a running level (host.ts onLevelEnd): reported the moment the level ends, with the collectibles it took and the hearts it cost.
import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS } from '../../index';
import { CAMPAIGN_CATALOG } from '../../campaign/index';
import { teleport } from '../../sim/testkit';
import { ObstRun } from '../host';
import type { LevelEnd } from './flow';

const FRAME = 1000 / 60;
const level = CAMPAIGN_CATALOG.levels.find((l) => l.id === '1-1')!;
function start() {
  const ends: LevelEnd[] = [];
  let over = 0;
  const run = new ObstRun(
    { mode: 'free', difficulty: 'normal', level: 1, seed: 1, slots: [0, 1], levels: [level.def] },
    {
      names: (s) => `J${s}`,
      bus: { emit: () => {} },
      onOver: () => {
        over++;
      },
      onLevelEnd: (e) => ends.push(e),
    },
  );
  const adv = (ms: number) => {
    for (let t = 0; t < ms; t += FRAME) run.step(FRAME);
  };
  adv(COUNTDOWN_MS + 100);
  const w = () => run.session.world;
  const goal = () => w().level.markers.goal[0]!;
  const winNow = () => {
    for (const p of w().players) teleport(w(), p.slot, goal().x, goal().y);
    adv(300);
  };
  return { run, ends, adv, w, winNow, over: () => over };
}

describe('the level end reaches the campaign at once', () => {
  it('reports a clear with the time, no deaths and the collectibles taken, as a bit mask', () => {
    const { ends, adv, w, winNow } = start();
    expect(w().ent.stars.length).toBe(level.collectibles); // the catalog counts what the world really spawns
    const second = w().ent.stars[1]!.cell;
    teleport(w(), 0, second.x, second.y);
    adv(200);
    expect(w().ent.stars[1]!.taken).toBe(true);
    winNow();
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ cleared: true, deaths: 0, collectiblesMask: 0b10 });
    expect(ends[0]!.timeMs).toBeGreaterThan(0);
    expect(ends[0]!.timeMs).toBe(Math.round(w().result!.timeSec * 1000)); // the world's own clock, in whole milliseconds
  });
  it('a clear with nothing collected has an empty mask', () => {
    const { ends, winNow } = start();
    winNow();
    expect(ends[0]).toMatchObject({ cleared: true, collectiblesMask: 0 });
  });
  it('is reported before the banners end: the pause is still running and the run is not over', () => {
    const { ends, over, winNow, run } = start();
    winNow();
    expect(ends).toHaveLength(1);
    expect(run.session.status).toBe('between');
    expect(over()).toBe(0);
  });
  it('running out of hearts reports an attempt that did not clear, with its deaths and no collectibles', () => {
    const { ends, adv, w } = start();
    const second = w().ent.stars[1]!.cell;
    teleport(w(), 0, second.x, second.y);
    adv(100);
    for (let i = 0; i < 200 && w().status === 'playing'; i++) {
      for (const p of w().players) if (p.connected && p.mode === 'active') p.body.y = w().level.h * 48 + 300;
      adv(40);
    }
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ cleared: false, collectiblesMask: 0 });
    expect(ends[0]!.deaths).toBeGreaterThan(0);
  });
  it('exactly once per level: the second attempt of a failed run reports again, the banners do not', () => {
    const { ends, adv, w, winNow } = start();
    for (let i = 0; i < 200 && w().status === 'playing'; i++) {
      for (const p of w().players) if (p.connected && p.mode === 'active') p.body.y = w().level.h * 48 + 300;
      adv(40);
    }
    adv(5000); // the pause ends and the retry starts
    adv(3200);
    winNow();
    expect(ends.map((e) => e.cleared)).toEqual([false, true]);
    adv(12_000);
    expect(ends).toHaveLength(2);
  });
});
