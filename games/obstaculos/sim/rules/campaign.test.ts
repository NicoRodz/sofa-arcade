// Campaign layer for 2 (sim/campaign.ts, campaignrules.ts): params(2) frozen, rope +20 %, super jump, anchor, edge assist, shared hearts, bubble v2,
// signals, throw arc. Every rule has its quick-match twin that must NOT show it (the layer is opt-in).
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PARAMS, JUMP_PEAK_PX, ROPE_LEN, TILE } from '../../constants';
import { type WORLD_ORDER, campaignParams, dparamsForCampaign, physicsForCampaign, superJumpV0, worldForDifficulty } from './campaign';
import { clearLevel, draw, hall, inp, level, names, of, pl, run, teleport, world } from '../testkit/testkit';
import { cameraHints } from './campaignrules';
import { hashState, snapshot, step } from '../world';
import { ObstSession } from '../../session';

const GROUND = 11;
const camp = (n?: number) => ({ campaign: { world: 'forest' as const, n } });
const B = (s: number) => (slot: number) => (slot === s ? inp({ grab: true }) : undefined);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const kill = (w: ReturnType<typeof world>, slot: number) => {
  pl(w, slot).body.y = w.level.h * TILE + 300;
}; // out of the grid: 'fall'

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

// A plateau (cols 1..14, top at row 8) over a chasm, the spawn on top and a floor on the last row: the cliff face is at x = 15 tiles.
function plateau(w = 30, h = 16): string[] {
  return Array.from({ length: h }, (_, y) => {
    const cs = ('#' + '.'.repeat(w - 2) + '#').split('');
    if (y >= 8) for (let x = 1; x <= 14; x++) cs[x] = '#';
    if (y === h - 1) cs.fill('#');
    if (y === 7) cs[2] = 'S';
    if (y === h - 2) cs[w - 3] = 'G';
    return cs.join('');
  });
}
const TOP = 7; // the row players stand in on the plateau

describe('dynamic 2: anchor (planted = infinite mass) and the slow slide', () => {
  // Slot 0 stands on the plateau 55 px from the edge, slot 1 steps off it and dangles from the rope.
  const hang = (planted: boolean, o: { campaign: boolean }) => {
    const w = world(level(plateau()), { mode: 'chain', ...(o.campaign ? camp() : {}) });
    teleport(w, 0, 13, TOP);
    teleport(w, 1, 16, 5);
    run(w, 5);
    if (planted) run(w, 1, B(0));
    const x0 = pl(w, 0).body.x;
    let taut = 0;
    run(w, 90, undefined, () => {
      if (w.ropes[0]!.links[0]!.taut) taut++;
    });
    return { w, dx: pl(w, 0).body.x - x0, taut };
  };
  it('the planted one does not move at all while its partner dangles from the rope', () => {
    const r = hang(true, { campaign: true });
    expect(pl(r.w, 0).planted).toBe(true);
    expect(Math.abs(r.dx)).toBeLessThan(0.01);
    expect(r.taut).toBeGreaterThan(50); // the rope really was taut: the zero above is not vacuous
    expect(pl(r.w, 1).mode).toBe('active');
  });
  it('the one that is not anchoring slides towards the edge at 0.5 tile/s (24 px/s), never faster', () => {
    const c = hang(false, { campaign: true });
    expect(c.taut).toBeGreaterThan(50);
    expect(c.dx).toBeGreaterThan(0.4 * TILE * (c.taut / 60) * 0.9); // it really slides...
    expect(c.dx).toBeLessThanOrEqual(0.5 * TILE * (c.taut / 60) + 0.5); // ...but never faster than 0.5 tile/s while the rope is taut
  });
  it('quick match keeps the old light anchor: a planted one is still dragged by the hanger (1/8 mass); the campaign one is not', () => {
    const q = hang(true, { campaign: false });
    expect(q.dx).toBeGreaterThan(1);
    expect(hang(true, { campaign: true }).dx).toBe(0);
  });
});

describe('edge assist (plan §5.1)', () => {
  // Slot 0 planted on the plateau, 6 tiles back; slot 1 hangs on the taut rope against the cliff face with its head 10 px below the ledge top.
  const setup = (o: { campaign: boolean }) => {
    const w = world(level(plateau()), { mode: 'chain', ...(o.campaign ? camp() : {}) });
    teleport(w, 0, 9, TOP);
    run(w, 5);
    run(w, 1, B(0));
    const p1 = pl(w, 1).body;
    p1.x = 15 * TILE + 0.5;
    p1.y = 8 * TILE + 10;
    p1.vx = 0;
    p1.vy = 0;
    p1.grounded = false;
    return w;
  };
  it('a hanger whose head reaches the ledge climbs on by itself (event, then it stands on the ledge); quick match leaves it hanging', () => {
    const w = setup({ campaign: true });
    const ev = run(w, 90);
    expect(of(ev, 'obst.edgeAssist')).toEqual([{ player: 1 }]);
    expect(pl(w, 1).body.grounded).toBe(true);
    expect(Math.abs(pl(w, 1).body.y + 46 - 8 * TILE)).toBeLessThan(0.7); // feet on the plateau top
    expect(pl(w, 1).body.x + 34).toBeLessThanOrEqual(15 * TILE); // over the plateau
    const q = setup({ campaign: false });
    const evq = run(q, 90);
    expect(of(evq, 'obst.edgeAssist')).toEqual([]);
    expect(pl(q, 1).body.y + 46).toBeGreaterThan(8 * TILE + 20); // still hanging below the ledge
  });
  it('it is a hanger-only help: a free fall past the cliff (no rope) does not trigger it', () => {
    const w = world(level(plateau()), { mode: 'free', ...camp() });
    const p1 = pl(w, 1).body;
    p1.x = 15 * TILE + 0.5;
    p1.y = 6 * TILE;
    p1.vy = 100;
    p1.grounded = false;
    expect(of(run(w, 90), 'obst.edgeAssist')).toEqual([]);
  });
  it('a hanger far below the ledge (head 2 tiles under it) is not helped', () => {
    const w = setup({ campaign: true });
    pl(w, 1).body.y = 10 * TILE;
    expect(of(run(w, 1), 'obst.edgeAssist')).toEqual([]);
  });
});

describe('shared hearts (plan §5.1)', () => {
  it('one falls: it flies to the partner in a bubble (no 1 s wait), costs one heart and rejoins invulnerable', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 60, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 1);
    const ev = run(w, 1);
    expect(of(ev, 'obst.death')).toEqual([{ player: 1, cause: 'fall' }]);
    expect(of(ev, 'obst.bubble')).toEqual([{ player: 1, reason: 'death' }]);
    expect(pl(w, 1).mode).toBe('bubble');
    expect(w.lives).toBe(5);
    expect(w.heartsLost).toBe(1);
    let inv = 0;
    const ev2 = run(w, 600, undefined, (e) => {
      if (of(e, 'obst.respawn').length) inv = pl(w, 1).invuln;
    });
    expect(of(ev2, 'obst.respawn')).toEqual([{ player: 1, via: 'bubble' }]);
    expect(pl(w, 1).mode).toBe('active');
    expect(inv).toBe(60);
    expect(Math.abs(pl(w, 1).body.x - pl(w, 0).body.x)).toBeLessThan(10 * TILE); // beside the partner, not at the spawn
  });
  it('quick match: the fallen waits 1 s and returns at the checkpoint (no bubble)', () => {
    const w = world(level(hall(80)), { mode: 'free' });
    teleport(w, 0, 60, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 1);
    const ev = run(w, 90);
    expect(of(ev, 'obst.bubble')).toEqual([]);
    expect(of(ev, 'obst.respawn')).toEqual([{ player: 1, via: 'checkpoint' }]);
  });
  it('both fall in the same step: one heart, both back at the checkpoint at once, no bubbles', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 60, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 0);
    kill(w, 1);
    const ev = run(w, 1);
    expect(of(ev, 'obst.respawn')).toEqual([
      { player: 0, via: 'team' },
      { player: 1, via: 'team' },
    ]);
    expect(names(ev)).not.toContain('obst.bubble');
    expect(w.lives).toBe(5);
    expect(pl(w, 0).body.x).toBeLessThan(5 * TILE);
  });
  it('0 hearts: hearts refill, the team returns to the checkpoint, the level goes on (never "failed") and the third star is gone', () => {
    const rows = draw(hall(80), [20, GROUND, 'P']);
    const w = world(level(rows), { mode: 'free', ...camp() });
    teleport(w, 0, 20, GROUND);
    teleport(w, 1, 21, GROUND);
    run(w, 5);
    expect(w.activeCheckpoint).toBe(0);
    teleport(w, 0, 40, GROUND);
    teleport(w, 1, 41, GROUND);
    let out: ReturnType<typeof run> = [];
    for (let i = 0; i < 6; i++) {
      kill(w, 0);
      kill(w, 1);
      out = run(w, 3);
    }
    expect(of(out, 'obst.heartsOut')).toEqual([{ toStart: false }]);
    expect(w.status).toBe('playing');
    expect(w.lives).toBe(6);
    expect(w.refills).toBe(1);
    expect(pl(w, 0).mode).toBe('active');
    expect(pl(w, 0).body.x).toBeGreaterThan(18 * TILE);
    expect(pl(w, 0).body.x).toBeLessThan(23 * TILE); // at the checkpoint, not at the spawn
    clearLevel(w);
    expect(w.status).toBe('cleared');
    expect(w.result!.campaign).toEqual({ heartsLost: 6, refills: 1, perfect: false });
  });
  it('Summit: 0 hearts goes back to the very start (checkpoints re-arm)', () => {
    const rows = draw(hall(80), [20, GROUND, 'P']);
    const w = world(level(rows), { mode: 'free', campaign: { world: 'summit' } });
    teleport(w, 0, 20, GROUND);
    teleport(w, 1, 21, GROUND);
    run(w, 5);
    expect(w.activeCheckpoint).toBe(0);
    teleport(w, 0, 40, GROUND);
    teleport(w, 1, 41, GROUND);
    let out: ReturnType<typeof run> = [];
    for (let i = 0; i < 3; i++) {
      kill(w, 0);
      kill(w, 1);
      out = run(w, 3);
    }
    expect(of(out, 'obst.heartsOut')).toEqual([{ toStart: true }]);
    expect(w.lives).toBe(3);
    expect(w.activeCheckpoint).toBe(-1);
    expect(w.ent.checkpoints[0]!.activated).toBe(false);
    expect(pl(w, 0).body.x).toBeLessThan(6 * TILE);
  });
  it('Beach: unlimited hearts never refill, but the lost ones are counted (the caller decides about the third star)', () => {
    const w = world(level(hall(80)), { mode: 'free', campaign: { world: 'beach' } });
    teleport(w, 0, 40, GROUND);
    teleport(w, 1, 41, GROUND);
    for (let i = 0; i < 10; i++) {
      kill(w, 0);
      kill(w, 1);
      run(w, 3);
    }
    expect(w.lives).toBe(Infinity);
    expect(w.heartsLost).toBe(10);
    expect(w.refills).toBe(0);
    clearLevel(w);
    expect(w.result!.campaign).toEqual({ heartsLost: 10, refills: 0, perfect: false });
  });
  it('a clean level is perfect', () => {
    const w = world(level(hall()), { mode: 'free', ...camp() });
    clearLevel(w);
    expect(w.result!.campaign).toEqual({ heartsLost: 0, refills: 0, perfect: true });
  });
});

describe('bubble v2: mashing A speeds it up', () => {
  const fly = (mash: boolean) => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 70, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 1);
    run(w, 1);
    let t = 0;
    for (; t < 900 && pl(w, 1).mode !== 'active'; t++) run(w, 1, (s) => (mash && s === 1 ? inp({ jump: true }) : undefined));
    return t;
  };
  it('the same trip takes less than half the time with A mashed', () => {
    const slow = fly(false),
      fast = fly(true);
    expect(slow).toBeGreaterThan(200);
    expect(fast).toBeLessThan(slow * 0.5);
  });
  it('the boost fades when the mashing stops', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 70, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    kill(w, 1);
    run(w, 10, (s) => (s === 1 ? inp({ jump: true }) : undefined));
    expect(pl(w, 1).camp.mash).toBe(4);
    run(w, 60);
    expect(pl(w, 1).camp.mash).toBe(0);
  });
});

describe('dynamic 1: signals', () => {
  it('a signal shows for 2 s over the head and fires obst.signal, from an active player and from a bubble', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 70, GROUND);
    teleport(w, 1, 5, GROUND);
    run(w, 5);
    const ev = run(w, 1, (s) => (s === 0 ? inp({ signal: 'wait' }) : undefined));
    expect(of(ev, 'obst.signal')).toEqual([{ player: 0, kind: 'wait' }]);
    expect(snapshot(w).players[0]!.signal).toBe('wait');
    run(w, 110);
    expect(snapshot(w).players[0]!.signal).toBe('wait'); // still there at 1.9 s
    run(w, 20);
    expect(snapshot(w).players[0]!.signal).toBeNull(); // gone after 2 s
    kill(w, 1);
    run(w, 1);
    expect(pl(w, 1).mode).toBe('bubble');
    const ev2 = run(w, 1, (s) => (s === 1 ? inp({ signal: 'arrowR' }) : undefined));
    expect(of(ev2, 'obst.signal')).toEqual([{ player: 1, kind: 'arrowR' }]);
  });
  it('holding "go" for 0.4 s starts a 3-2-1 one number per second, then 0 ("ya"); releasing before 0.4 s starts nothing', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 12, GROUND);
    run(w, 5);
    expect(
      of(
        run(w, 20, (s) => (s === 0 ? inp({ goHeld: true }) : undefined)),
        'obst.countdown',
      ),
    ).toEqual([]);
    run(w, 10);
    const marks: [number, number][] = [];
    const t0 = w.tick;
    run(
      w,
      40,
      (s) => (s === 0 ? inp({ goHeld: true }) : undefined),
      (ev) => {
        for (const c of of(ev, 'obst.countdown')) marks.push([w.tick - t0, c.n]);
      },
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]![1]).toBe(3);
    expect(snapshot(w).countdown).toEqual({ by: 0, n: 3 });
    const t3 = marks[0]![0] + t0;
    const rest: [number, number][] = [];
    run(w, 200, undefined, (ev) => {
      for (const c of of(ev, 'obst.countdown')) rest.push([w.tick - t3, c.n]);
    });
    expect(rest).toEqual([
      [60, 2],
      [120, 1],
      [180, 0],
    ]);
    expect(snapshot(w).countdown).toBeNull();
  });
  it('a dead player cannot signal', () => {
    const w = world(level(hall(80)), { mode: 'free', ...camp() });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 12, GROUND);
    run(w, 5);
    kill(w, 0);
    kill(w, 1); // both: dead for a step, then the team returns
    pl(w, 0).mode = 'dead';
    pl(w, 0).timer = 30;
    const ev = step(w, [inp({ signal: 'go' })]);
    expect(of(ev, 'obst.signal')).toEqual([]);
  });
});

describe('throw arc (plan §5.1)', () => {
  it('while carrying a teammate the snapshot gives the arc, and it ends where the real throw lands', () => {
    const w = world(level(hall(60)), { mode: 'free', ...camp() });
    teleport(w, 0, 10, GROUND);
    teleport(w, 1, 10, GROUND);
    pl(w, 1).body.x = pl(w, 0).body.x - 36;
    run(w, 5);
    expect(snapshot(w).players[0]!.arc).toBeNull(); // nothing in the hands
    run(w, 1, B(0));
    expect(pl(w, 0).holding?.kind).toBe('player');
    const arc = snapshot(w).players[0]!.arc!;
    expect(arc.length).toBeGreaterThan(5);
    expect(snapshot(w).players[1]!.arc).toBeNull();
    const end = arc[arc.length - 1]!;
    expect(Math.min(...arc.map((p) => p.y))).toBeLessThan(arc[0]!.y - 2 * TILE); // it goes up
    run(w, 1, B(0)); // throw
    for (let n = 0; n < 150 && (n < 3 || pl(w, 1).thrown > 0); n++) run(w, 1); // until it touches down (the slide after the landing is not part of the arc: with the A5 launch, x1.3, it is longer)
    const b = pl(w, 1).body;
    expect(Math.abs(b.x + 17 - end.x)).toBeLessThan(16);
    expect(Math.abs(b.y + 23 - end.y)).toBeLessThan(20);
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
