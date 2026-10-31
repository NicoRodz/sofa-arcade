// menuV2: the "Aleatorio" draw (maps/lobby.ts pickAutoMap): every coop family, no map without a dynamic, a bag per session, family weights by difficulty.
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '@pichi/core/difficulty';
import { mulberry32 } from '@pichi/core/rng';
import {
  COOP_MAPS,
  FAMILY_PCT,
  MAP_DYNAMICS,
  OUT_OF_DRAW,
  autoMaps,
  familyOfMap,
  fixedMap,
  lobbyGroupOfMap,
  mapLevel,
  pickAutoMap,
  recommendedForN,
  type MapFamily,
} from './maps';

const FAMILIES: MapFamily[] = ['classic', 'surface', 'series', 'taller'];

describe('the maps `auto` may draw', () => {
  it('N 1-8 x difficulty: never a map without a dynamic, never one of the six plain maps, always inside the range of the map', () => {
    for (const d of DIFFICULTIES)
      for (let n = 1; n <= 8; n++) {
        const pool = autoMaps(n, d);
        expect(pool.length, `${d} N${n}`).toBeGreaterThan(0);
        for (const m of pool) {
          expect(MAP_DYNAMICS[m.id], `map ${m.id}`).toBeGreaterThanOrEqual(1);
          expect(OUT_OF_DRAW).not.toContain(m.id);
          expect(Math.max(2, n) >= m.nMin && Math.max(2, n) <= m.nMax, `map ${m.id} N${n}`).toBe(true);
        }
      }
  });
  it('the six plain maps are out of the draw but exist and can be picked by hand', () => {
    expect(OUT_OF_DRAW).toEqual(['1', '2', '4', '6', '7', '8']);
    for (const id of OUT_OF_DRAW) {
      expect(fixedMap(id), id).toBeDefined();
      expect(MAP_DYNAMICS[id], id).toBe(0);
    }
    expect(COOP_MAPS.every((m) => m.id in MAP_DYNAMICS)).toBe(true);
  });
  it('Fácil: level 2 at most and no Taller; Difícil: level 2 or more; Normal: any', () => {
    for (let n = 2; n <= 8; n++) {
      for (const m of autoMaps(n, 'easy')) {
        expect(mapLevel(m), m.id).toBeLessThanOrEqual(2);
        expect(familyOfMap(m.id)).not.toBe('taller');
      }
      for (const m of autoMaps(n, 'hard')) expect(mapLevel(m), m.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('Taller, Carta larga and ice/belts all show up (Normal, N 3-4), and with no N the draw assumes 4', () => {
    for (const n of [3, 4]) expect(new Set(autoMaps(n, 'normal').map((m) => familyOfMap(m.id))), `N${n}`).toEqual(new Set(FAMILIES));
    expect(autoMaps(undefined, 'normal').map((m) => m.id)).toEqual(autoMaps(4, 'normal').map((m) => m.id));
  });
});

describe('the draw', () => {
  const first = (n: number, d: 'easy' | 'normal' | 'hard', seed: number) => pickAutoMap(n, d, mulberry32(seed), { played: new Set() });
  it('first draw of 1000 sessions: each family within 10 points of its weight (renormalised over the families that exist for this N)', () => {
    for (const d of DIFFICULTIES)
      for (const n of [2, 3, 4, 5, 6, 8]) {
        const present = FAMILIES.filter((f) => autoMaps(n, d).some((m) => familyOfMap(m.id) === f));
        const total = present.reduce((a, f) => a + FAMILY_PCT[d][f], 0);
        const count = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
        for (let s = 0; s < 1000; s++) count[familyOfMap(first(n, d, s * 31 + n).id)]!++;
        for (const f of FAMILIES) {
          const want = present.includes(f) ? (100 * FAMILY_PCT[d][f]) / total : 0;
          expect(Math.abs(count[f]! / 10 - want), `${d} N${n} ${f}`).toBeLessThanOrEqual(10);
        }
      }
  });
  it('a session of N=4 Normal (6 rounds x 1000 sessions): families near their weights even with the bag, no map repeated before the pool runs out, no family twice in a row', () => {
    const count = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
    const pool = autoMaps(4, 'normal').length;
    for (let s = 0; s < 1000; s++) {
      const rand = mulberry32(s + 99);
      const played = new Set<string>();
      let last: MapFamily | undefined;
      for (let r = 0; r < 6; r++) {
        const m = pickAutoMap(4, 'normal', rand, { played, last, first: r === 0 });
        expect(played.has(m.id), `session ${s} round ${r}`).toBe(false);
        expect(familyOfMap(m.id)).not.toBe(last);
        played.add(m.id);
        last = familyOfMap(m.id);
        count[last]!++;
      }
      expect(played.size).toBe(6);
    }
    expect(pool).toBeGreaterThan(6);
    for (const f of FAMILIES) expect(Math.abs(count[f]! / 60 - FAMILY_PCT.normal[f]), f).toBeLessThanOrEqual(10);
  });
  it('the bag refills when every eligible map was played; the first round takes the lowest level available; same rand same draw', () => {
    const all = autoMaps(8, 'easy');
    const m = pickAutoMap(8, 'easy', mulberry32(1), { played: new Set(all.map((x) => x.id)) });
    expect(all.map((x) => x.id)).toContain(m.id);
    for (let s = 0; s < 50; s++) {
      const low = Math.min(...autoMaps(4, 'normal').map(mapLevel));
      expect(mapLevel(pickAutoMap(4, 'normal', mulberry32(s), { played: new Set(), first: true })), `seed ${s}`).toBe(low);
    }
    expect(first(4, 'hard', 5).id).toBe(first(4, 'hard', 5).id);
  });
});

describe('the lobby lists', () => {
  it('the six plain maps are their own page; the rest keep the page of their set', () => {
    for (const id of OUT_OF_DRAW) expect(lobbyGroupOfMap(id), id).toBe('plain');
    expect([lobbyGroupOfMap('3'), lobbyGroupOfMap('20'), lobbyGroupOfMap('29')]).toEqual(['classic', 'series', 'taller']);
  });
  it('"Recomendados para N": up to 3 maps of the draw, one per family, none played, not the last family first, deterministic', () => {
    for (const d of DIFFICULTIES)
      for (let n = 2; n <= 8; n++) {
        const rec = recommendedForN(n, d, { played: new Set() });
        const ids = autoMaps(n, d).map((m) => m.id);
        expect(rec.length, `${d} N${n}`).toBeGreaterThan(0);
        expect(rec.length).toBeLessThanOrEqual(3);
        expect(new Set(rec.map((m) => familyOfMap(m.id))).size).toBe(rec.length);
        for (const m of rec) expect(ids).toContain(m.id);
        expect(recommendedForN(n, d, { played: new Set() }).map((m) => m.id)).toEqual(rec.map((m) => m.id));
        const played = new Set(rec.map((m) => m.id));
        for (const m of recommendedForN(n, d, { played }))
          if (ids.length > played.size) expect(played.has(m.id), `${d} N${n} ${m.id}`).toBe(false);
        const last = familyOfMap(rec[0]!.id);
        if (rec.length > 1) expect(familyOfMap(recommendedForN(n, d, { played: new Set(), last })[0]!.id)).not.toBe(last);
      }
  });
});
