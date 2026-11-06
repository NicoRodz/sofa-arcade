// Campaign layer for 2 (sim/campaign.ts, campaignrules.ts): params(2) frozen, opt-in, rope +20 %, super jump, camera hints. Every rule has its quick-match
// twin that must NOT show it (the layer is opt-in). Anchor, edge assist, throw arc: campaign-anchor-edge.test.ts; hearts, bubble, signals: campaign-hearts-signals.test.ts.

import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PARAMS, JUMP_PEAK_PX, ROPE_LEN, TILE } from '../../constants';
import { type WORLD_ORDER, campaignParams, dparamsForCampaign, physicsForCampaign, superJumpV0, worldForDifficulty } from './campaign';
import { draw, hall, inp, level, names, of, pl, run, teleport, world } from '../testkit/testkit';
import { cameraHints } from './campaignrules';
import { hashState, snapshot } from '../world';
import { ObstSession } from '../../session';

const GROUND = 11;
const camp = (n?: number) => ({ campaign: { world: 'forest' as const, n } });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('params(N): the numbers of the layer, N=2 frozen', () => {
  it('snapshot of params(2) for the forest (any change to the validated layer shows up here)', () => {
    expect(campaignParams(2, 'forest')).toEqual({
      n: 2,
      world: 'forest',
      ropeMult: 1.2,
      ropeLen: ROPE_LEN * 1.2,
      anchorHolds: 1,
      slideTilesPerSec: 0.5,
      edgeAssist: true,
      edgeReachPx: 24,
      superJumpWindowMs: 150,
      superJumpMult: 1.3,
      forgiveMult: 1.3,
      hearts: 6,
      hazardMult: 0.8,
      rescueSec: 2,
      checkpointEverySec: 25,
      band: [0.15, 0.35],
      restartAtStart: false,
      bubbleMashMax: 4,
      bubbleMashGain: 0.5,
      signalShowSec: 2,
      signalHoldSec: 0.4,
      camPadTiles: 3,
      camLookAtGoal: true,
      // A5 (dynamics 4-9 and the throw niche): new keys, none of the ones above changed
      balanceTilesPerSec: 2,
      targetSec: 4,
      enemyStunSec: 3,
      enemyExtra: 0,
      enemyTilesPerSec: 1.5,
      enemyPushPxPerSec: 360,
      iceFriction: 0.15,
      windPxPerSec: 140,
      windWarnSec: 1,
      pickTilesPerSec: 1,
      throwVxMult: 1.3,
      throwSlack: 1.5,
      throwSlackSec: 1.2,
      // A6 (dynamics 10-12): new keys, none of the ones above changed
      lanternRadiusTiles: 4,
      bungeeMaxMult: 1.6,
      bungeeStiffness: 40,
      bungeeDamping: 7,
      sinkTilesPerSec: 0.5,
      sinkRiseTilesPerSec: 0.5,
      geyserWarnSec: 1,
      geyserLaunchMult: 1.65,
    });
  });
  it('the world table of plan §3 (hearts, forgiveness, auto-rescue, hazards, checkpoint spacing, bands)', () => {
    const row = (w: (typeof WORLD_ORDER)[number]) => {
      const p = campaignParams(2, w);
      return [p.hearts, p.checkpointEverySec, p.forgiveMult, p.rescueSec, p.hazardMult, ...p.band];
    };
    expect(row('beach')).toEqual([Infinity, 15, 1.5, 1, 0.6, 0, 0.15]);
    expect(row('forest')).toEqual([6, 25, 1.3, 2, 0.8, 0.15, 0.35]);
    expect(row('glacier')).toEqual([5, 30, 1.15, 3, 0.9, 0.35, 0.55]);
    expect(row('mine')).toEqual([5, 40, 1, 3, 1, 0.5, 0.7]);
    expect(row('volcano')).toEqual([4, 45, 1, 4, 1.1, 0.65, 0.9]);
    expect(row('summit')).toEqual([3, 60, 0.9, 5, 1.2, 0.85, 1]);
    expect(campaignParams(2, 'summit').restartAtStart).toBe(true);
    expect(campaignParams(2, 'volcano').restartAtStart).toBe(false);
  });
  it('N>2 only grows what plan §5.2 says (hearts, anchor, super jump window); the rest stays at the N=2 value', () => {
    const a = campaignParams(2, 'forest'),
      b = campaignParams(6, 'forest');
    expect(b.hearts).toBe(8); // +floor((6-2)/2)
    expect(b.anchorHolds).toBe(2);
    expect(b.superJumpWindowMs).toBe(150 + 4 * 30);
    expect([b.targetSec, b.enemyExtra, b.windPxPerSec]).toEqual([4 + 2, 2, 140 * 0.8]); // A5: target +1 s and enemies +1 every 2 players, wind x0.8
    expect({ ...b, n: 2, hearts: 6, anchorHolds: 1, superJumpWindowMs: 150, targetSec: 4, enemyExtra: 0, windPxPerSec: 140 }).toEqual(a);
    expect(campaignParams(3, 'beach').hearts).toBe(Infinity);
    expect(campaignParams(1, 'forest').n).toBe(2); // clamped
  });
  it('coyote and buffer follow the world (x1.5 on the beach, x0.9 on the summit); the legacy table is untouched', () => {
    expect(physicsForCampaign(campaignParams(2, 'beach'))).toEqual({ coyote: 11, buffer: 14, stickyEdges: true });
    expect(physicsForCampaign(campaignParams(2, 'mine'))).toEqual({ coyote: 7, buffer: 9, stickyEdges: false });
    expect(physicsForCampaign(campaignParams(2, 'summit'))).toEqual({ coyote: 6, buffer: 8, stickyEdges: false });
    expect(physicsForCampaign(campaignParams(2, 'mine'), 50).coyote).toBe(7 + 3); // + ceil(50 / 16.7)
    expect(physicsForCampaign(campaignParams(2, 'mine'), 400).coyote).toBe(12); // capped like the legacy table
    expect(DIFFICULTY_PARAMS.normal.coyoteBase).toBe(7);
    expect(dparamsForCampaign(campaignParams(2, 'glacier'))).toMatchObject({
      lives: 5,
      bubbleSec: 3,
      bubbleCostsLife: false,
      hazardSpeed: 0.9,
    });
  });
  it('lobby difficulty: Easy plays with the previous world, Hard with the next (clamped at both ends)', () => {
    expect(worldForDifficulty('glacier', 'easy')).toBe('forest');
    expect(worldForDifficulty('glacier', 'hard')).toBe('mine');
    expect(worldForDifficulty('glacier', 'normal')).toBe('glacier');
    expect(worldForDifficulty('beach', 'easy')).toBe('beach');
    expect(worldForDifficulty('summit', 'hard')).toBe('summit');
  });
});

describe('opt-in: a quick-match world is not touched', () => {
  it('no campaign option: camp is null, the rope is the old one and no campaign event ever fires', () => {
    const w = world(level(hall()), { mode: 'chain' });
    expect(w.camp).toBeNull();
    expect(w.ropes[0]!.links[0]!.base).toBe(ROPE_LEN);
    expect(w.dparams).toBe(DIFFICULTY_PARAMS.normal);
    const all = run(w, 600, (s, t) =>
      inp({ move: s === 0 ? 1 : -1, jump: t % 50 === 0, grab: t % 90 === 0, signal: t === 100 ? 'go' : undefined, goHeld: true }),
    );
    expect(names(all).filter((n) => /signal|countdown|superJump|edgeAssist|heartsOut/.test(n))).toEqual([]);
    expect(snapshot(w).camp).toBeNull();
    expect(snapshot(w).players.every((p) => p.arc === null && p.signal === null)).toBe(true);
  });
  it('a campaign world is deterministic: the same inputs give the same hash, and it differs from the quick match', () => {
    const f = (s: number, t: number) => inp({ move: s === 0 ? 1 : 0.5, jump: t % 40 === s, grab: t % 120 === 7 && s === 1 });
    const a = world(level(hall()), camp()),
      b = world(level(hall()), camp()),
      q = world(level(hall()));
    run(a, 500, f);
    run(b, 500, f);
    run(q, 500, f);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).not.toBe(hashState(q));
  });
});

describe('rope +20 % (plan §5.1)', () => {
  it('two players pulling apart settle at the campaign rope (201.6 px), not at the old 168 px', () => {
    const far = (w: ReturnType<typeof world>) => {
      let m = 0;
      run(
        w,
        300,
        (s) => inp({ move: s === 0 ? -1 : 1 }),
        () => {
          m = Math.max(m, dist(pl(w, 0).body, pl(w, 1).body));
        },
      );
      return m;
    };
    const c = world(level(hall(60)), camp());
    teleport(c, 0, 28, GROUND);
    teleport(c, 1, 30, GROUND);
    const q = world(level(hall(60)));
    teleport(q, 0, 28, GROUND);
    teleport(q, 1, 30, GROUND);
    expect(c.ropes[0]!.links[0]!.base).toBeCloseTo(ROPE_LEN * 1.2, 6);
    const dc = far(c),
      dq = far(q);
    expect(dc).toBeGreaterThan(ROPE_LEN * 1.2 * 0.95);
    expect(dc).toBeLessThan(ROPE_LEN * 1.2 * 1.05);
    expect(dq).toBeLessThan(ROPE_LEN * 1.05);
    expect(snapshot(c).ropes[0]!.links[0]!.base).toBeCloseTo(ROPE_LEN * 1.2, 6);
  });
});

describe('dynamic 3: super jump', () => {
  const rise = (offset: number | null) => {
    // [peak rise of slot 1, events]
    const w = world(level(hall()), { mode: 'free', ...camp() });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 14, GROUND);
    run(w, 10);
    const y0 = pl(w, 1).body.y;
    let peak = 0;
    const ev: ReturnType<typeof run> = [];
    ev.push(
      ...run(
        w,
        90,
        (s, t) =>
          offset === null
            ? s === 1 && t === 10
              ? inp({ jump: true })
              : undefined
            : (s === 1 && t === 10) || (s === 0 && t === 10 + offset)
              ? inp({ jump: true })
              : undefined,
        () => {
          peak = Math.max(peak, y0 - pl(w, 1).body.y);
        },
      ),
    );
    return { peak, ev };
  };
  it("two ground jumps in the same step peak at 1.3x the solo jump (and the solo jump is the plan's 173 px)", () => {
    const solo = rise(null),
      pair = rise(0);
    expect(solo.peak).toBeGreaterThan(JUMP_PEAK_PX - 3);
    expect(solo.peak).toBeLessThan(JUMP_PEAK_PX + 3);
    expect(pair.peak / solo.peak).toBeGreaterThan(1.27);
    expect(pair.peak / solo.peak).toBeLessThan(1.33);
    expect(of(pair.ev, 'obst.superJump')).toEqual([{ players: [0, 1] }]);
    expect(of(solo.ev, 'obst.superJump')).toEqual([]);
    expect(superJumpV0(campaignParams(2, 'forest'))).toBeCloseTo(911 * Math.sqrt(1.3), 6);
  });
  it('window: 9 steps (150 ms) apart still pairs, 11 steps (183 ms) does not', () => {
    expect(of(rise(9).ev, 'obst.superJump')).toHaveLength(1);
    expect(rise(9).peak).toBeGreaterThan(rise(null).peak + 15);
    expect(of(rise(11).ev, 'obst.superJump')).toEqual([]);
    expect(rise(11).peak).toBeCloseTo(rise(null).peak, 0);
  });
  it('a pair is used up: a third jump of the same player does not pair with the old one', () => {
    const w = world(level(hall()), { mode: 'free', ...camp() });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 14, GROUND);
    run(w, 10);
    const ev = run(w, 200, (s, t) => (t === 10 || (t === 100 && s === 1) ? inp({ jump: true }) : undefined));
    expect(of(ev, 'obst.superJump')).toHaveLength(1);
  });
  it('quick match: two simultaneous jumps are plain jumps', () => {
    const w = world(level(hall()), { mode: 'free' });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 14, GROUND);
    run(w, 10);
    const y0 = pl(w, 1).body.y;
    let peak = 0;
    run(
      w,
      90,
      (_s, t) => (t === 10 ? inp({ jump: true }) : undefined),
      () => {
        peak = Math.max(peak, y0 - pl(w, 1).body.y);
      },
    );
    expect(peak).toBeLessThan(JUMP_PEAK_PX + 3);
  });
});

describe('camera hints and the session (plan §5.1)', () => {
  it('cameraHints: 3 tiles of margin, look at the goal, the hazard; null in a quick match', () => {
    const rows = draw(hall(60), [20, GROUND, '.']);
    const w = world(level(rows, { hazard: { kind: 'avalanche', speed: 1 } }), { mode: 'chain', ...camp() });
    const g = w.level.markers.goal[0]!;
    expect(cameraHints(w)).toEqual({ goalX: g.x * TILE + TILE / 2, hazard: { kind: 'avalanche', pos: -4 * TILE }, padTiles: 3 });
    run(w, 60);
    expect(cameraHints(w)!.hazard!.pos).toBeGreaterThan(-4 * TILE); // the avalanche advanced: the hint follows it
    expect(cameraHints(world(level(hall())))).toBeNull();
  });
  it('the session passes the campaign option to every world it builds (and a quick-match session builds none)', () => {
    const mk = (c?: { world: 'forest' }) =>
      new ObstSession({
        mode: 'chain',
        difficulty: 'normal',
        level: 0,
        seed: 1,
        slots: [0, 1],
        levels: [level(hall()), level(hall())],
        campaign: c,
      });
    const s = mk({ world: 'forest' });
    expect(s.world.camp?.world).toBe('forest');
    expect(s.world.ropes[0]!.links[0]!.base).toBeCloseTo(ROPE_LEN * 1.2, 6);
    expect(mk().world.camp).toBeNull();
  });
});
