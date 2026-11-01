import { describe, expect, it } from 'vitest';
import { CAMPAIGN, CAMPAIGN_CATALOG, campaignOrder, levelById, pathOf, summitNeed } from '../index';
import {
  SKIP_AFTER_FAILURES,
  applyResult,
  canOfferSkip,
  continueLevel,
  emptyProgress,
  fullMask,
  isUnlocked,
  isWorldUnlocked,
  mergeExpedition,
  newExpedition,
  nextLevel,
  openWorld,
  progressOf,
  skipLevel,
  starCount,
  summitState,
  totalStars,
  unlockedLevels,
  worldStars,
  type Expedition,
  type LevelOutcome,
} from '../index';
import { continueLabel } from '../index';
import { parseExpedition } from '../index';
import { planCatalog } from '../tools/testkit';

const T0 = 1_000;
const plan = planCatalog();
const res = (levelId: string, o: Partial<LevelOutcome> = {}): LevelOutcome => ({
  levelId,
  cleared: true,
  timeMs: 50_000,
  collectiblesMask: 0,
  deaths: 3,
  ...o,
});
const fresh = (name = 'Nico y Angi') => newExpedition('exp-test0001', name, T0);
let clock = T0;
const play = (e: Expedition, r: LevelOutcome) => applyResult(e, plan, r, ++clock);
// Clears levels 1..n of world w with every star.
function clearWorld(e: Expedition, w: string, upTo = 7, perfect = true): Expedition {
  for (let o = 1; o <= upTo; o++) e = play(e, res(`${w}-${o}`, perfect ? { collectiblesMask: fullMask(3), deaths: 0 } : {}));
  return e;
}

describe("S2's catalog adapted to the interface", () => {
  it('has the built levels only (Playa, Bosque and Glaciar, 1-1..3-7), one boss each, the world order of the plan and the practice stations', () => {
    const c = CAMPAIGN_CATALOG;
    expect(c.worlds.map((w) => w.biome)).toEqual(['beach', 'forest', 'glacier']); // Mina and Volcán appear as their levels get built (A6)
    expect(pathOf(c, '1').map((l) => l.id)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7']);
    expect(pathOf(c, '2').map((l) => l.id)).toEqual(['2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7']);
    expect(pathOf(c, '3').map((l) => l.id)).toEqual(['3-1', '3-2', '3-3', '3-4', '3-5', '3-6', '3-7']);
    for (const w of ['1', '2', '3'])
      expect(
        pathOf(c, w)
          .filter((l) => l.kind === 'boss')
          .map((l) => l.id),
      ).toEqual([`${w}-7`]);
    expect(levelById(c, '2-6')?.mode).toBe('free'); // Escarabajos is Libres, 2-5 (E/L) plays Encadenados
    expect(new Set(c.levels.map((l) => l.id)).size).toBe(c.levels.length);
    expect(c.levels.every((l) => l.validatedFor.includes(2) && l.collectibles === 3 && l.botMs! > 0)).toBe(true);
    expect(levelById(c, '1-1')?.mode).toBe('free'); // plan: 1-1 is Libres
    expect(levelById(c, '1-2')?.mode).toBe('chain');
    expect(c.practice.map((p) => p.id)).toEqual(['p-move', 'p-jump', 'p-rope', 'p-signals', 'p-tower', 'p-anchor', 'p-throw', 'p-swing']);
    expect(c.practice.every((p) => p.kind === 'practice' && p.opensAt && levelById(c, p.opensAt))).toBe(true);
  });
  it('every CAMPAIGN level that is built is in it, and none that is planned', () => {
    const built = CAMPAIGN.filter((l) => l.status === 'built' && l.def).map((l) => l.id);
    expect(CAMPAIGN_CATALOG.levels.map((l) => l.id)).toEqual(built);
  });
});

describe('stars: 1 goal, 2 every collectible, 3 no hearts lost', () => {
  it('a clear with nothing else gives only star 1 and the clock medal follows the bot time', () => {
    const e = play(fresh(), res('1-1', { timeMs: 96_000 })); // botMs 60 s x 1.6 = 96 s: exactly on the edge
    expect(progressOf(e, '1-1')).toMatchObject({ done: true, stars: [true, false, false], bestTimeMs: 96_000, timeMedal: true });
    const slow = play(fresh(), res('1-1', { timeMs: 96_001 }));
    expect(progressOf(slow, '1-1').timeMedal).toBe(false);
  });
  it('star 2 needs the whole set of collectibles, and they add up across runs', () => {
    let e = play(fresh(), res('1-1', { collectiblesMask: 0b011 }));
    expect(progressOf(e, '1-1').stars[1]).toBe(false);
    e = play(e, res('1-1', { collectiblesMask: 0b100 }));
    expect(progressOf(e, '1-1')).toMatchObject({ collectiblesMask: 0b111, stars: [true, true, false] });
  });
  it('star 3 needs zero hearts lost and is not given with infinite hearts', () => {
    expect(progressOf(play(fresh(), res('1-1', { deaths: 0 })), '1-1').stars[2]).toBe(true);
    const assisted = { ...fresh(), assists: { infiniteHearts: true, slowMotion: false, instantBubble: false, permanentSilhouette: false } };
    expect(progressOf(play(assisted, res('1-1', { deaths: 0 })), '1-1').stars[2]).toBe(false);
  });
  it('a worse later run never takes anything away', () => {
    let e = play(fresh(), res('1-1', { deaths: 0, collectiblesMask: 0b111, timeMs: 40_000 }));
    e = play(e, res('1-1', { deaths: 9, collectiblesMask: 0, timeMs: 99_000 }));
    expect(progressOf(e, '1-1')).toMatchObject({ stars: [true, true, true], bestTimeMs: 40_000, timeMedal: true });
    const failed = play(e, res('1-1', { cleared: false, deaths: 12 }));
    expect(progressOf(failed, '1-1')).toEqual(progressOf(e, '1-1'));
    expect(failed.lastLevelId).toBe('1-1');
  });
  it('a failed run on a new level records nothing but where the group was', () => {
    const e = play(fresh(), res('1-2', { cleared: false }));
    expect(e.levels['1-2']).toMatchObject({ done: false, stars: [false, false, false] });
    expect(totalStars(e)).toBe(0);
  });
  it('an unknown level id is ignored', () => {
    const e = fresh();
    expect(play(e, res('9-9'))).toBe(e);
  });
});

describe('monotone merge', () => {
  const a = () => clearWorld(fresh(), '1', 3, false);
  const b = () => play(play(fresh(), res('1-1', { collectiblesMask: 0b111, deaths: 0, timeMs: 30_000 })), res('2-1'));
  it('takes the best of both sides, level by level', () => {
    const m = mergeExpedition(a(), b());
    expect(progressOf(m, '1-1')).toMatchObject({ done: true, stars: [true, true, true], bestTimeMs: 30_000 });
    expect(progressOf(m, '1-3').done).toBe(true);
    expect(progressOf(m, '2-1').done).toBe(true);
  });
  it('is commutative, associative and idempotent', () => {
    const x = a(),
      y = b(),
      z = skipLevel(play(fresh(), res('1-1')), plan, '1-2', ++clock);
    expect(mergeExpedition(x, y)).toEqual(mergeExpedition(y, x));
    expect(mergeExpedition(mergeExpedition(x, y), z)).toEqual(mergeExpedition(x, mergeExpedition(y, z)));
    expect(mergeExpedition(x, x)).toEqual(x);
  });
  it('never lowers anything: stars, medal, mask, done and the unlocked list only grow, the best time only shrinks', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let e = fresh();
    for (let i = 0; i < 300; i++) {
      const lvl = `${1 + Math.floor(rnd() * 5)}-${1 + Math.floor(rnd() * 7)}`;
      const before = e;
      const r = res(lvl, {
        cleared: rnd() < 0.7,
        timeMs: 20_000 + Math.floor(rnd() * 120_000),
        collectiblesMask: Math.floor(rnd() * 8),
        deaths: Math.floor(rnd() * 3),
      });
      e =
        rnd() < 0.15
          ? mergeExpedition(e, applyResult(fresh(), plan, r, ++clock))
          : rnd() < 0.1
            ? skipLevel(e, plan, lvl, ++clock)
            : applyResult(e, plan, r, ++clock);
      for (const id of Object.keys(before.levels)) {
        const p = progressOf(e, id),
          q = before.levels[id]!;
        expect(p.done || !q.done).toBe(true);
        expect(starCount(p)).toBeGreaterThanOrEqual(starCount(q));
        q.stars.forEach((s, k) => expect(p.stars[k] || !s).toBe(true));
        expect(p.timeMedal || !q.timeMedal).toBe(true);
        expect((p.collectiblesMask & q.collectiblesMask) >>> 0).toBe(q.collectiblesMask);
        if (q.bestTimeMs !== null) expect(p.bestTimeMs!).toBeLessThanOrEqual(q.bestTimeMs);
      }
    }
  });
  it('an old copy of the expedition cannot erase newer progress', () => {
    const stale = fresh();
    const now = clearWorld(stale, '1', 4);
    expect(mergeExpedition(now, stale).levels).toEqual(now.levels);
    expect(mergeExpedition(stale, now).levels).toEqual(now.levels);
  });
  it('name, assists and last level come from the newer side', () => {
    const old = { ...fresh('Viejo'), updatedAt: 5 };
    const neu = { ...fresh('Nuevo'), updatedAt: 9, lastLevelId: '1-2' };
    expect(mergeExpedition(old, neu)).toMatchObject({ name: 'Nuevo', lastLevelId: '1-2', updatedAt: 9 });
    expect(mergeExpedition(neu, old)).toMatchObject({ name: 'Nuevo', lastLevelId: '1-2', updatedAt: 9 });
  });
  it('a skipped level stops being skipped once it is cleared, on either side of the merge', () => {
    const skipped = skipLevel(fresh(), plan, '1-1', ++clock);
    expect(progressOf(skipped, '1-1')).toMatchObject({ skipped: true, done: false });
    const cleared = play(fresh(), res('1-1'));
    expect(progressOf(mergeExpedition(skipped, cleared), '1-1')).toMatchObject({ skipped: false, done: true });
    expect(progressOf(mergeExpedition(cleared, skipped), '1-1')).toMatchObject({ skipped: false, done: true });
  });
});

describe('unlocks (plan §3)', () => {
  it('a new expedition opens 1-1 only', () => {
    const e = fresh();
    expect(unlockedLevels(e, plan).map((l) => l.id)).toEqual(['1-1']);
    expect(isUnlocked(e, plan, '1-2')).toBe(false);
  });
  it('a level opens when the one before is completed or skipped', () => {
    let e = play(fresh(), res('1-1'));
    expect(isUnlocked(e, plan, '1-2')).toBe(true);
    expect(isUnlocked(e, plan, '1-3')).toBe(false);
    e = skipLevel(e, plan, '1-2', ++clock);
    expect(isUnlocked(e, plan, '1-3')).toBe(true);
  });
  it('a world opens only by beating the boss: skipping it is not enough', () => {
    let e = clearWorld(fresh(), '1', 6);
    expect(isWorldUnlocked(e, plan, '2')).toBe(false);
    e = skipLevel(e, plan, '1-7', ++clock);
    expect(isWorldUnlocked(e, plan, '2')).toBe(false);
    expect(isUnlocked(e, plan, '2-1')).toBe(false);
    e = play(e, res('1-7'));
    expect(isWorldUnlocked(e, plan, '2')).toBe(true);
    expect(isUnlocked(e, plan, '2-1')).toBe(true);
    expect(isUnlocked(e, plan, '3-1')).toBe(false);
  });
  it('a summit opens with 15 of the 21 stars of its world and stays hidden before', () => {
    expect(summitNeed(plan, '1')).toBe(15);
    let e = clearWorld(fresh(), '1', 7, false); // 7 levels x 1 star = 7
    expect(worldStars(e, plan, '1')).toBe(7);
    expect(summitState(e, plan, '1')).toBe('hidden');
    expect(isUnlocked(e, plan, 'C1')).toBe(false);
    e = clearWorld(e, '1', 5, true); // five levels at 3 stars + two at 1 = 17
    expect(worldStars(e, plan, '1')).toBe(17);
    expect(summitState(e, plan, '1')).toBe('open');
    expect(isUnlocked(e, plan, 'C1')).toBe(true);
    expect(isUnlocked(e, plan, 'C2')).toBe(false); // other worlds' summits need their own stars
  });
  it('exactly 14 stars is not enough, 15 is', () => {
    let e = fresh();
    for (let o = 1; o <= 7; o++) e = play(e, res(`1-${o}`, { collectiblesMask: o <= 4 ? fullMask(3) : 0, deaths: o <= 4 ? 0 : 5 })); // 4 x 3 + 3 x 1 = 15
    expect(worldStars(e, plan, '1')).toBe(15);
    expect(isUnlocked(e, plan, 'C1')).toBe(true);
    const e14 = {
      ...e,
      levels: { ...e.levels, '1-1': { ...e.levels['1-1']!, stars: [true, true, false] as [boolean, boolean, boolean] } },
    };
    expect(worldStars(e14, plan, '1')).toBe(14);
    expect(isUnlocked(e14, plan, 'C1')).toBe(false);
  });
  it('"ya sabemos escalar" opens the Bosque from the start and nothing else', () => {
    const e = openWorld(fresh(), plan, '2', ++clock);
    expect(isUnlocked(e, plan, '2-1')).toBe(true);
    expect(isUnlocked(e, plan, '2-2')).toBe(false);
    expect(isUnlocked(e, plan, '3-1')).toBe(false);
    expect(openWorld(e, plan, 'zz', ++clock)).toBe(e);
  });
  it('a level that is not open cannot be skipped, nor can one that is already done', () => {
    const e = fresh();
    expect(skipLevel(e, plan, '1-3', ++clock)).toBe(e);
    const done = play(e, res('1-1'));
    expect(skipLevel(done, plan, '1-1', ++clock)).toBe(done);
    expect(skipLevel(e, plan, 'C1', ++clock)).toBe(e);
  });
  it('the skip is offered after five game overs in a row', () => {
    expect(SKIP_AFTER_FAILURES).toBe(5);
    expect(canOfferSkip(4)).toBe(false);
    expect(canOfferSkip(5)).toBe(true);
  });
});

describe('what "Continuar" and "Siguiente" offer', () => {
  it('Continuar is the first open level not yet passed, across worlds', () => {
    let e = fresh();
    expect(continueLevel(e, plan)?.id).toBe('1-1');
    e = play(e, res('1-1'));
    expect(continueLevel(e, plan)?.id).toBe('1-2');
    e = clearWorld(e, '1', 7);
    expect(continueLevel(e, plan)?.id).toBe('2-1');
    e = clearWorld(clearWorld(clearWorld(clearWorld(e, '2'), '3'), '4'), '5');
    expect(continueLevel(e, plan)).toBeNull();
  });
  it('replaying an old level does not move Continuar back', () => {
    let e = clearWorld(fresh(), '1', 3);
    e = play(e, res('1-1'));
    expect(e.lastLevelId).toBe('1-1');
    expect(continueLevel(e, plan)?.id).toBe('1-4');
  });
  it('a skipped level is passed: Continuar moves on to the next one', () => {
    const e = skipLevel(fresh(), plan, '1-1', ++clock);
    expect(continueLevel(e, plan)?.id).toBe('1-2');
  });
  it('Siguiente is the following level only when it is open', () => {
    const e = play(fresh(), res('1-1'));
    expect(nextLevel(e, plan, '1-1')?.id).toBe('1-2');
    expect(nextLevel(e, plan, '1-2')).toBeNull(); // 1-3 is still closed
    expect(nextLevel(e, plan, '1-7')).toBeNull();
    expect(nextLevel(clearWorld(fresh(), '1', 6), plan, '1-6')?.id).toBe('1-7');
  });
  it('the button text names the group, the world, the level and the stars', () => {
    const e = clearWorld(fresh(), '1', 7);
    expect(continueLabel(e, plan)).toBe('Continuar · Nico y Angi · Bosque 2-1 · 21★');
    expect(continueLabel(fresh(), CAMPAIGN_CATALOG)).toBe('Continuar · Nico y Angi · Playa 1-1 · 0★');
  });
  it('the legacy catalog walks the same rules', () => {
    const c = CAMPAIGN_CATALOG;
    let e = fresh();
    for (const l of campaignOrder(c)) {
      expect(continueLevel(e, c)?.id).toBe(l.id);
      e = applyResult(e, c, { levelId: l.id, cleared: true, timeMs: 1, collectiblesMask: 0, deaths: 0 }, ++clock);
    }
    expect(continueLevel(e, c)).toBeNull();
  });
});

describe('parseExpedition refuses what is not an expedition', () => {
  const good = () => JSON.parse(JSON.stringify(clearWorld(fresh(), '1', 2)));
  it('round-trips a real one', () => {
    const e = clearWorld(fresh(), '1', 2);
    expect(parseExpedition(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });
  it.each([
    ['null', null],
    ['an array', []],
    ['a wrong schema version', { ...good(), schemaVersion: 2 }],
    ['an id that climbs out of the folder', { ...good(), id: '../x' }],
    ['an empty name', { ...good(), name: '' }],
    ['a level key with a slash', { ...good(), levels: { 'a/b': emptyProgress() } }],
    ['three stars as numbers', { ...good(), levels: { '1-1': { ...emptyProgress(), stars: [1, 0, 0] } } }],
    ['a negative mask', { ...good(), levels: { '1-1': { ...emptyProgress(), collectiblesMask: -1 } } }],
    ['unlocked that is not a list', { ...good(), unlocked: 'world:2' }],
    ['assists that is not an object', { ...good(), assists: 3 }],
  ])('%s', (_n, v) => {
    expect(parseExpedition(v)).toBeNull();
  });
  it('fills the assists a file written by an older version does not have', () => {
    const { assists: _a, ...old } = good();
    expect(parseExpedition(old)?.assists).toEqual({
      infiniteHearts: false,
      slowMotion: false,
      instantBubble: false,
      permanentSilhouette: false,
    });
  });
});
