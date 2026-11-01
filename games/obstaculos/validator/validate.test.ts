import { describe, expect, it } from 'vitest';
import { Canvas } from '../modules/dsl';
import { flatCap, toLevel } from '../generate/assemble';
import type { EntityParam, LevelDef, Tether } from '../types';
import { LEVEL_14 } from '../levels';
import type { Mechanic } from '../mechanics';
import { ROPE_LEN } from '../constants';
import { parseLevel } from '../parse';
import { campaignParams, dparamsForCampaign, physicsForCampaign } from '../sim/rules/campaign';
import { physicsFor } from '../sim/player/player';
import { buildGraph } from './graph';
import { validateLevel, validateState } from './validate';

// Level = flat cap with S + the canvas + flat cap with G. Standing row 14, floor top row 15.
function wrap(c: Canvas, params?: Record<string, EntityParam>, tether: Tether = 'any', extra: Partial<LevelDef> = {}): LevelDef {
  const lvl = toLevel([flatCap(6, { ch: 'S', x: 2 }), { w: c.w, rows: c.rows(), params }, flatCap(6, { ch: 'G', x: 3 })], {
    id: 't',
    name: 't',
    biome: 'beach',
    players: { min: 2, max: 8 },
    tether,
    stars: 1,
    parSec: 60,
  });
  return { ...lvl, ...extra };
}
const ok = (def: LevelDef, n = 2, mode: 'chain' | 'free' = 'free', diff: 'easy' | 'normal' | 'hard' = 'hard') =>
  validateState(def, { n, mode, diff });
const gapLevel = (g: number) => wrap(new Canvas(g + 8).pit(4, 3 + g, '~'));
const wallLevel = (h: number) => wrap(new Canvas(12).rect(4, 15 - h, 8, 14, '#'));

describe('envelope: jumps come from stepPlayer and must use <= 92 % of it', () => {
  it('a gap of 2 to 5 tiles is valid, 6 (only with a perfect jump) and 7 are not', () => {
    for (const g of [2, 3, 4, 5]) expect(ok(gapLevel(g)).ok, `gap ${g}`).toBe(true);
    expect(ok(gapLevel(6)).ok, 'gap 6').toBe(false);
    expect(ok(gapLevel(7)).ok, 'gap 7').toBe(false);
  });
  it('tied (Encadenados) the rope keeps a single jump under 5 tiles: gap 4 passes, 5 does not', () => {
    expect(ok(gapLevel(4), 2, 'chain').ok).toBe(true);
    expect(ok(gapLevel(5), 2, 'chain').ok).toBe(false);
  });
  it('a step of 3 tiles is solo, 4 needs a tower of 2 players', () => {
    expect(ok(wallLevel(3)).path.every((e) => !e.coop)).toBe(true);
    const r = ok(wallLevel(4));
    expect(r.ok).toBe(true);
    expect(r.path.some((e) => e.kind === 'tower' || e.kind === 'throw')).toBe(true);
  });
  it('tied with 2 players the 168 px rope caps the tower: a 3-tile step is fine, 4 is not (free: the tower of 2 still does it)', () => {
    expect(ok(wallLevel(3), 2, 'chain').ok).toBe(true);
    const tied = ok(wallLevel(4), 2, 'chain');
    expect(tied.ok).toBe(false);
    expect(tied.errors.join()).toMatch(/pioneer cannot reach G/);
    expect(ok(wallLevel(4), 2, 'free').ok).toBe(true);
  });
  it('5 tiles need 3 players (tower of 2): n = 2 fails, n = 3 passes', () => {
    expect(ok(wallLevel(5), 2).ok).toBe(false);
    expect(ok(wallLevel(5), 3).ok).toBe(true);
  });
  it('6 tiles: a tower of 3 gets a pioneer up, but the Hard hand zone (2 tiles) cannot pull the rest; Normal (2.5) can', () => {
    expect(ok(wallLevel(6), 4, 'free', 'hard').ok).toBe(false);
    expect(ok(wallLevel(6), 4, 'free', 'normal').ok).toBe(true);
  });
  it('hazards kill: a spike strip is crossed by jumping, a 7-wide one is not', () => {
    expect(ok(wrap(new Canvas(12).rect(4, 14, 6, 14, '^'))).ok).toBe(true);
    expect(ok(wrap(new Canvas(16).rect(4, 14, 11, 14, '^'))).ok).toBe(false);
  });
  it('an unreachable goal is rejected with a reason', () => {
    const r = ok(wrap(new Canvas(12).rect(4, 0, 5, 17, '#')));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/pioneer cannot reach G/);
  });
});

describe('plates, levers, gates (OR semantics, holders must be able to follow)', () => {
  const gate = (c: Canvas) => c.rect(10, 0, 10, 11, '#').rect(10, 12, 10, 14, 'A');
  it('a gate nobody can open is a lint error', () => {
    const r = ok(wrap(gate(new Canvas(20)), { A: { kind: 'gate' } }));
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/never opens/);
  });
  it('a held plate with no second plate on the far side strands its holder; latching it fixes that', () => {
    const held = wrap(gate(new Canvas(20)).rect(4, 14, 6, 14, 'a'), {
      a: { kind: 'plate', weight: 1, opens: 'A', latch: false },
      A: { kind: 'gate' },
    });
    expect(ok(held, 3).ok).toBe(false);
    const latched = wrap(gate(new Canvas(20)).rect(4, 14, 6, 14, 'a'), {
      a: { kind: 'plate', weight: 1, opens: 'A', latch: true },
      A: { kind: 'gate' },
    });
    expect(ok(latched, 3).ok).toBe(true);
  });
  it('a / b: the second plate beyond the gate takes over the hold (w_a <= n-1, w_b <= n-w_a)', () => {
    const pair = (wa: 'half-up' | 'all', wb: 'half-down' | 'all') =>
      wrap(gate(new Canvas(22)).rect(4, 14, 6, 14, 'a').rect(14, 14, 16, 14, 'b'), {
        a: { kind: 'plate', weight: wa, opens: 'A', latch: false },
        b: { kind: 'plate', weight: wb, opens: 'A', latch: false },
        A: { kind: 'gate' },
      });
    for (const n of [2, 3, 4, 7]) expect(ok(pair('half-up', 'half-down'), n).ok, `n=${n}`).toBe(true);
    expect(ok(pair('half-up', 'all'), 4).ok).toBe(false); // b would need everybody, nobody is left
    expect(ok(pair('all', 'half-down'), 4).ok).toBe(false); // a needs everybody, nobody passes
  });
  it('a plate heavier than the team never works', () => {
    const heavy = (w: number) =>
      wrap(gate(new Canvas(20)).rect(4, 14, 6, 14, 'a'), { a: { kind: 'plate', weight: w, opens: 'A', latch: true }, A: { kind: 'gate' } });
    expect(ok(heavy(5), 3).ok).toBe(false);
    expect(ok(heavy(5), 5).ok).toBe(true);
  });
  it('a ladder that only a far-away latch plate can bring is not free', () => {
    const c = new Canvas(20).rect(8, 5, 9, 14, '#').rect(7, 5, 7, 14, 'F').rect(2, 12, 4, 14, '#').set(3, 11, 'a');
    expect(ok(wrap(c, { a: { kind: 'plate', weight: 1, opens: 'F', latch: true }, F: { kind: 'ladder' } })).ok).toBe(true);
    const noPlate = new Canvas(20).rect(8, 5, 9, 14, '#').rect(7, 5, 7, 14, 'F');
    const r = ok(wrap(noPlate, { F: { kind: 'ladder' } }));
    expect(r.ok).toBe(true); // an objective with no activator is always on
    expect(ok(wrap(new Canvas(20).rect(8, 5, 9, 14, '#'))).ok).toBe(false); // without it the 10-high wall stops everyone
  });
  it('levers and movers: a bridge mover over a 12-wide pit is crossed only with its lever pair (hold + handoff)', () => {
    const pit = () => new Canvas(26).pit(5, 18, '^', 16).rect(5, 15, 7, 15, 'A').set(3, 14, 'a').set(21, 14, 'b');
    const params: Record<string, EntityParam> = {
      a: { kind: 'lever', opens: 'A', latch: false },
      b: { kind: 'lever', opens: 'A', latch: false },
      A: { kind: 'mover', dx: 11, dy: 0, periodSec: 5 },
    };
    expect(ok(wrap(pit(), params)).ok).toBe(true);
    const oneLever = { ...params };
    delete oneLever.b;
    expect(ok(wrap(new Canvas(26).pit(5, 18, '^', 16).rect(5, 15, 7, 15, 'A').set(3, 14, 'a'), oneLever)).ok).toBe(false); // one lever: the holder never crosses
  });
});

describe('keys, rings, hazards', () => {
  it('a door needs its key, and a key behind the door does not count', () => {
    const door = (c: Canvas) => c.rect(14, 0, 14, 11, '#').rect(14, 12, 14, 14, 'K');
    expect(ok(wrap(door(new Canvas(22)).rect(3, 11, 7, 14, '#').set(5, 10, 'k'))).ok).toBe(true);
    expect(ok(wrap(door(new Canvas(22)).rect(17, 11, 20, 14, '#').set(18, 10, 'k'))).ok).toBe(false);
    expect(validateLevel(wrap(door(new Canvas(22))), 'hard').ok).toBe(false); // lint: a door and no key
  });
  it('a ring bridges a 7-wide abyss when tied; without the ring it does not; a ring in a free-only level is a lint error', () => {
    const abyss = (ring: boolean) => {
      const c = new Canvas(18).pit(4, 10, '~');
      if (ring) c.set(4, 12, 'o');
      return c;
    };
    expect(ok(wrap(abyss(true), undefined, 'chainOnly'), 2, 'chain').ok).toBe(true);
    expect(ok(wrap(abyss(false), undefined, 'chainOnly'), 2, 'chain').ok).toBe(false);
    expect(ok(wrap(abyss(true), undefined, 'freeOnly'), 2, 'free').errors.join()).toMatch(/rings only work tied/);
  });
  it('the avalanche catches a slow route and spares a fast one', () => {
    const run = (speed: number) => wrap(new Canvas(60), undefined, 'any', { hazard: { kind: 'avalanche', speed } });
    expect(ok(run(2.2)).ok).toBe(true);
    expect(ok(run(9)).ok).toBe(false);
  });
  it('rising lava catches a climb that is too slow (level 14 at its speed and at 5x)', () => {
    const l14 = (speed: number): LevelDef => ({ ...LEVEL_14, hazard: { kind: 'risingLava', speed } });
    expect(ok(l14(0.6), 2, 'chain').ok).toBe(true);
    const fast = ok(l14(3), 2, 'chain');
    expect(fast.ok).toBe(false);
    expect(fast.errors.join()).toMatch(/risingLava catches/);
  });
});

describe('validateLevel: every mode and the player range', () => {
  it('reports each mode and player count it tried and names the one that failed', () => {
    const v = validateLevel(wallLevel(5), 'hard', [2, 3]);
    expect(v.reports).toHaveLength(4); // chain + free, n = 2 and 3
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/n=2/);
  });
});

describe("allow: an explorer that only knows some mechanics (the learning test's bot) and the record of what it used", () => {
  const only = (...m: Mechanic[]) => new Set<Mechanic>(m);
  const run = (def: LevelDef, allow: Set<Mechanic>, n = 2, mode: 'chain' | 'free' = 'free') =>
    validateState(def, { n, mode, diff: 'hard', allow });
  it('no jump, no gap: a 2-tile hole stops a walker, a jumper crosses it and the record shows a jump', () => {
    expect(run(gapLevel(2), only()).ok).toBe(false);
    const r = run(gapLevel(2), only('jump'));
    expect(r.ok).toBe(true);
    expect(r.uses.jump).toBeGreaterThanOrEqual(1);
  });
  it('a 4-tile wall needs the tower for the pioneer and the hand for the rest: take either away and it fails; with both the record shows both', () => {
    expect(run(wallLevel(4), only('jump', 'hand')).ok).toBe(false);
    expect(run(wallLevel(4), only('jump', 'tower')).ok).toBe(false);
    const r = run(wallLevel(4), only('jump', 'tower', 'hand'));
    expect(r.ok).toBe(true);
    expect(r.uses.tower).toBeGreaterThanOrEqual(1);
    expect(r.uses.hand).toBeGreaterThanOrEqual(1);
  });
  it('a ring bridges the abyss only for a bot that knows how to swing; the record shows the swing', () => {
    const abyss = new Canvas(18).pit(4, 10, '~').set(4, 12, 'o');
    expect(run(wrap(abyss, undefined, 'chainOnly'), only('jump', 'tower', 'hand'), 2, 'chain').ok).toBe(false);
    const r = run(wrap(abyss, undefined, 'chainOnly'), only('jump', 'swing'), 2, 'chain');
    expect(r.ok).toBe(true);
    expect(r.uses.swing).toBeGreaterThanOrEqual(1);
  });
  it('boyas are springs: without the spring the water between them is a wall, with it the record shows it', () => {
    const boyas = wrap(new Canvas(18).pit(4, 13, '~').set(7, 15, 'T').set(11, 15, 'T'));
    expect(run(boyas, only('jump')).ok).toBe(false);
    const r = run(boyas, only('jump', 'spring'));
    expect(r.ok).toBe(true);
    expect(r.uses.spring).toBeGreaterThanOrEqual(1);
  });
  it('a latch plate and a key are gadgets of their own: not known, not pressed; known, and the record counts them', () => {
    const plate = wrap(new Canvas(20).rect(10, 0, 10, 11, '#').rect(10, 12, 10, 14, 'A').rect(4, 14, 6, 14, 'a'), {
      a: { kind: 'plate', weight: 1, opens: 'A', latch: true },
      A: { kind: 'gate' },
    });
    expect(run(plate, only('jump', 'tower', 'hand')).ok).toBe(false);
    const r = run(plate, only('jump', 'plate'));
    expect(r.ok).toBe(true);
    expect(r.uses.plate).toBe(1);
    const door = wrap(new Canvas(22).rect(14, 0, 14, 11, '#').rect(14, 12, 14, 14, 'K').rect(3, 11, 7, 14, '#').set(5, 10, 'k'));
    expect(run(door, only('jump', 'tower', 'hand')).ok).toBe(false);
    expect(run(door, only('jump', 'tower', 'hand', 'key')).uses.key).toBe(1);
  });
  it('no allow list means everything is allowed: same verdict as before', () => {
    expect(validateState(wallLevel(4), { n: 2, mode: 'free', diff: 'hard' }).ok).toBe(true);
    const u = validateState(wallLevel(4), { n: 2, mode: 'free', diff: 'hard' }).uses;
    expect((u.tower ?? 0) + (u.throw ?? 0)).toBeGreaterThanOrEqual(1); // the pioneer goes up by tower or by throw, whichever is cheaper
  });
});

describe("campaign environment: the validator reads S1's parameters (sim/campaign.ts), not the legacy difficulty table", () => {
  it("env.world gives the world's coyote/buffer (physicsForCampaign), hand zone and rope (params.ropeLen)", () => {
    const c = campaignParams(2, 'beach');
    const g = buildGraph(
      parseLevel(wallLevel(3)),
      { n: 2, mode: 'chain', diff: 'hard', world: 'beach' },
      { open: new Set(), doors: new Set() },
      [],
      { pioneer: true },
    );
    expect(g.params).toEqual({ ...physicsForCampaign(c), iceFriction: c.iceFriction }); // + the ice friction of A5 (physicsOfWorld): coyote, buffer and sticky edges are still the world's
    expect(g.dp.handZoneTiles).toBe(dparamsForCampaign(c).handZoneTiles);
    expect(g.ropeLen).toBeCloseTo(c.ropeLen, 6);
    const legacy = buildGraph(parseLevel(wallLevel(3)), { n: 2, mode: 'chain', diff: 'hard' }, { open: new Set(), doors: new Set() }, [], {
      pioneer: true,
    });
    expect(legacy.params).toEqual(physicsFor('hard'));
    expect(legacy.ropeLen).toBe(ROPE_LEN);
  });
  it('the rope of the campaign (201.6 px) lets a tower of 2 beat a 4-tile wall tied; the legacy 168 px does not', () => {
    expect(validateState(wallLevel(4), { n: 2, mode: 'chain', diff: 'hard', world: 'beach' }).ok).toBe(true);
    expect(validateState(wallLevel(4), { n: 2, mode: 'chain', diff: 'hard' }).ok).toBe(false);
    expect(validateState(wallLevel(5), { n: 2, mode: 'chain', diff: 'hard', world: 'beach' }).ok).toBe(false); // 240 px: even 201.6 cannot hold it
  });
});
