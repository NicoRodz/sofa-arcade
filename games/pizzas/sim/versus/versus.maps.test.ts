import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, MAP_IDS, lobbyMaps, parseMap, type HalfName, type VersusMapDef } from '../maps';
import { SIGMAS, isometryCheck } from '../maps/symmetry';
import { VERSUS_BASE_MAPS, VERSUS_MAPS, VERSUS_MAP_IDS, deriveVersus, mirrorize, versusMap, versusMapsFor } from './maps';
import { teamRange, validateVersus, versusLayout } from '../validate';

const get = (id: string) => versusMap(id)!;
const edit = (rows: readonly string[], cells: [number, number, string][]) => {
  const out = rows.map((r) => [...r]);
  for (const [x, y, c] of cells) out[y]![x] = c;
  return out.map((r) => r.join(''));
};
const on = (m: VersusMapDef, rows: string[]): VersusMapDef => ({ ...m, rows });
const sigmaOf = (m: VersusMapDef) => (p: [number, number]) => SIGMAS[m.versus.sigma](p[0], p[1], 16, 9);
const errors = (m: VersusMapDef, opts?: Parameters<typeof validateVersus>[1]) => validateVersus(m, opts).errors.join(' | ');

describe('the versus registry', () => {
  it('has the five designed maps plus the one derived from coop map 11, all valid and exactly symmetric', () => {
    expect(VERSUS_MAP_IDS).toEqual(['V1', 'V2', 'V3', 'V4', 'V5', '11-vs']);
    for (const m of VERSUS_MAPS) {
      const r = validateVersus(m);
      expect(r, m.id).toMatchObject({ ok: true, errors: [], s: 1 });
      expect(r.spread, m.id).toEqual({ routeCost: 0, firstStep: 0, interaction: 0, area: 0, shared: 0 });
    }
  });

  it('keeps the coop registry as it was: 15 maps, none of them versus', () => {
    expect(FIXED_MAPS).toHaveLength(15);
    expect(MAP_IDS).not.toContain('V1');
    expect(FIXED_MAPS.every((m) => !('versus' in m))).toBe(true);
  });

  it('declares the design ranges and isometries (V1 2-8 mirror, V2 4-8 mirror, V3 2-6 half turn, V4 4-8 mirror, V5 2-4 half turn)', () => {
    expect(VERSUS_BASE_MAPS.map((m) => [m.id, m.nMin, m.nMax, m.versus.sigma])).toEqual([
      ['V1', 2, 8, 'mirrorX'],
      ['V2', 4, 8, 'mirrorX'],
      ['V3', 2, 6, 'rot180'],
      ['V4', 4, 8, 'mirrorX'],
      ['V5', 2, 4, 'rot180'],
    ]);
  });

  it('the lobby filters by total players, with the coop helpers', () => {
    expect(versusMapsFor(6).map((m) => m.id)).toEqual(['V1', 'V2', 'V3', 'V4', '11-vs']);
    expect(versusMapsFor(2).map((m) => m.id)).toEqual(['V1', 'V3', 'V5', '11-vs']);
    expect(
      lobbyMaps(3, VERSUS_MAPS)
        .filter((x) => x.status.state === 'blocked')
        .map((x) => x.map.id),
    ).toEqual(['V2', 'V4']);
  });

  it('teams per range: the smallest team of the smallest split to the biggest team of the biggest', () => {
    expect(teamRange(2, 8)).toEqual({ min: 1, max: 4 });
    expect(teamRange(4, 8)).toEqual({ min: 2, max: 4 });
    expect(teamRange(3, 5)).toEqual({ min: 1, max: 3 });
    expect(teamRange(2, 4)).toEqual({ min: 1, max: 2 });
  });
});

describe('V1 Duelo clásico, V3 Dos pisos: the design drawings through the real legend', () => {
  // design legend -> real legend (maps.ts): M T Q C H -> 1 2 3 K O; '=' counter -> C; B trash -> X; a/b -> S; '|' barrier -> '#' wall;
  // L (sink) -> C: a sink needs the dirty return U and turns washing on, which coop only does from 5 players.
  const legend: Record<string, string> = { M: '1', T: '2', Q: '3', C: 'K', H: 'O', '=': 'C', B: 'X', a: 'S', b: 'S', '|': '#', L: 'C' };
  const real = (rows: string[]) => rows.map((r) => [...r].map((c) => legend[c] ?? c).join(''));
  const noCatapult = (rows: readonly string[]) => rows.map((r) => r.replaceAll('Y', 'C')); // sabotage put a catapult 'Y' in place of one counter per kitchen: the rest is the design drawing
  it('V1 is the design drawing translated, with the barrier as walls', () => {
    expect(noCatapult(get('V1').rows)).toEqual(
      real([
        '#MTQ#HH||HH#QTM#',
        '=......||......=',
        'C......||......C',
        'C..==..||..==..C',
        '=..==..||..==..=',
        'P.a..a.||.b..b.P',
        'L.a..a.||.b..b.L',
        'B......||......B',
        '#==E==#||#==E==#',
      ]),
    );
  });
  it('V3 is the design drawing translated', () => {
    expect(noCatapult(get('V3').rows)).toEqual(
      real([
        '#MTQ=HH=CC=PL=B#',
        '=..............E',
        '=..a...a...a...=',
        '#==============#',
        '||||||||||||||||',
        '#==============#',
        '=...b...b...b..=',
        'E..............=',
        '#B=LP=CC=HH=QTM#',
      ]),
    );
  });
});

describe('validateVersus: one test per map, each with its sabotage', () => {
  it('V1: 38 floor tiles and 4 spawns per kitchen; moving the cheese crate in one kitchen only turns it red, in both keeps it green', () => {
    const m = get('V1');
    const r = validateVersus(m);
    expect(r.kitchens!.map((k) => k.area)).toEqual([38, 38]); // the design counts 38
    expect(m.versus.spawns.map((s) => s.length)).toEqual([4, 4]);
    // sabotage: the left cheese crate (3, 0) moves to (4, 0)
    const moved = edit(m.rows, [
      [3, 0, '#'],
      [4, 0, '3'],
    ]);
    expect(errors(on(m, moved))).toMatch(/symmetry .* mismatch|symmetry \d+\.\d%/);
    expect(validateVersus(on(m, moved)).ok).toBe(false);
    // the same move on the twin (12, 0) -> (11, 0) is still a mirror map
    expect(
      validateVersus(
        on(
          m,
          edit(moved, [
            [12, 0, '#'],
            [11, 0, '3'],
          ]),
        ),
      ),
    ).toMatchObject({ ok: true, errors: [] });
  });

  it('V2: the pantry crates (7, 4) and (8, 4) are declared shared, one touching each kitchen; without them the cheese is gone', () => {
    const m = get('V2');
    expect(m.versus.shared).toEqual([
      [7, 4],
      [8, 4],
    ]);
    const lay = versusLayout(parseMap(m.rows, true), 'mirrorX', m.versus.shared);
    expect([lay.owner[4]![7], lay.owner[4]![8]]).toEqual([0, 1]);
    // sabotage 1: only one pantry crate is left
    expect(errors(on(m, edit(m.rows, [[8, 4, '#']])))).toMatch(/symmetry/);
    // sabotage 2: both are walled but still declared shared
    expect(
      errors(
        on(
          m,
          edit(m.rows, [
            [7, 4, '#'],
            [8, 4, '#'],
          ]),
        ),
      ),
    ).toMatch(/shared tile \(7, 4\) is not a station/);
    // moving the pantry up one row on both sides keeps it a fair duel (and the declaration has to follow it)
    const up = edit(m.rows, [
      [7, 4, '#'],
      [8, 4, '#'],
      [7, 3, '3'],
      [8, 3, '3'],
    ]);
    expect(
      validateVersus({
        ...on(m, up),
        versus: {
          ...m.versus,
          shared: [
            [7, 3],
            [8, 3],
          ],
        },
      }).ok,
    ).toBe(true);
    expect(errors(on(m, up))).toMatch(/shared tile \(7, 4\) is not a station/);
  });

  it('V3: one corridor each (28 floor tiles), twins by the half turn; opening the barrier symmetrically joins the kitchens', () => {
    const m = get('V3');
    expect(validateVersus(m).kitchens!.map((k) => k.area)).toEqual([28, 28]);
    expect(m.versus.spawns[1]).toEqual([
      [12, 6],
      [8, 6],
      [4, 6],
    ]); // the design maps (3,2) (7,2) (11,2) to these
    const open = edit(m.rows, [
      [7, 3, '.'],
      [7, 4, '.'],
      [7, 5, '.'],
      [8, 3, '.'],
      [8, 4, '.'],
      [8, 5, '.'],
    ]); // symmetric by the half turn
    const r = validateVersus(on(m, open), { requireMirror: false });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/crosses the barrier/);
    // sabotage: the half turn broken (kitchen B's delivery counter moves to the other end)
    expect(
      errors(
        on(
          m,
          edit(m.rows, [
            [0, 7, 'C'],
            [15, 7, 'E'],
          ]),
        ),
      ),
    ).toMatch(/symmetry/);
  });

  it('V4: ovens on an island; taking every oven out of both kitchens leaves no recipe', () => {
    const m = get('V4');
    expect(validateVersus(m).ok).toBe(true);
    const r = validateVersus(
      on(
        m,
        edit(m.rows, [
          [2, 3, 'C'],
          [3, 3, 'C'],
          [12, 3, 'C'],
          [13, 3, 'C'],
        ]),
      ),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(' | ')).toMatch(/kitchen A: missing station O/);
    expect(r.errors.join(' | ')).toMatch(/kitchen B: missing station O/);
    expect(r.s).toBe(1); // the symmetry alone would not have caught it
  });

  it('V5: 5x5 kitchens for 1v1 and 2v2; without their starts there is no team of 2', () => {
    const m = get('V5');
    expect(validateVersus(m).kitchens!.map((k) => k.area)).toEqual([25, 25]);
    const r = validateVersus(
      on(
        m,
        edit(m.rows, [
          [2, 4, '.'],
          [4, 4, '.'],
          [13, 4, '.'],
          [11, 4, '.'],
        ]),
      ),
    );
    expect(r.errors.join(' | ')).toMatch(/kitchen A: 0 spawns for teams of up to 2/);
    expect(r.ok).toBe(false);
  });

  it('11-vs (coop Tres carriles, top half): derived, valid; with the plates taken out of the kept half it cannot be derived', () => {
    const coop = FIXED_MAPS.find((m) => m.id === '11')!;
    expect(validateVersus(deriveVersus(coop, 'top'))).toMatchObject({ ok: true, errors: [] });
    expect(get('11-vs').rows[4]).toBe('#'.repeat(16)); // the barrier row
    const noPlates = { ...coop, rows: edit(coop.rows, [[15, 2, 'C']]) };
    expect(validateVersus(deriveVersus(noPlates, 'top')).errors.join()).toMatch(/missing station P/);
  });
});

describe('validateVersus: what it checks', () => {
  const v1 = get('V1');

  it('symmetry share and the first mismatch are reported; a mirror map needs 100%', () => {
    const rows = edit(v1.rows, [[2, 2, 'C']]);
    const r = validateVersus(on(v1, rows));
    expect(r.s).toBeCloseTo(1 - 2 / 144, 10);
    expect(r.errors.join()).toMatch(/symmetry 98\.6%.*\(2, 2\)/);
  });

  it('an equivalent but asymmetric map passes when the mirror is not required (the trash moves one tile in one kitchen), and fails when it is', () => {
    const rows = edit(v1.rows, [
      [15, 7, 'C'],
      [15, 6, 'X'],
    ]);
    expect(validateVersus(on(v1, rows), { requireMirror: false })).toMatchObject({ ok: true, errors: [] });
    expect(validateVersus(on(v1, rows)).ok).toBe(false);
  });

  it('a kitchen that is more than 3% dearer fails on cost even with the mirror off (delivery counter at the far end of kitchen B)', () => {
    const rows = edit(v1.rows, [
      [3, 8, 'C'],
      [3, 8, 'C'],
      [12, 8, 'C'],
      [15, 1, 'E'],
    ]);
    const r = validateVersus(on(v1, rows), { requireMirror: false });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' | ')).toMatch(/differs \d+\.\d% between kitchens/);
    expect(r.spread.routeCost).toBeGreaterThan(0.03);
  });

  it('kitchen B spawns must be the twins of kitchen A spawns, index by index (the mirror test)', () => {
    const swapped = {
      ...v1,
      versus: { ...v1.versus, spawns: [v1.versus.spawns[0], [...v1.versus.spawns[1]].reverse()] as VersusMapDef['versus']['spawns'] },
    };
    expect(errors(swapped)).toMatch(/spawns are not sigma of kitchen A/);
    const sg = sigmaOf(v1);
    expect(v1.versus.spawns[1]).toEqual(v1.versus.spawns[0].map((p) => sg([p[0], p[1]])));
  });

  it('a station that touches both kitchens must be declared shared; a counter joining them is a connection', () => {
    // V3 has a one-row barrier: counters in it with floor on both sides are a pass-through (twins by the half turn, so the mirror holds)
    const v3 = get('V3');
    const bridge = edit(v3.rows, [
      [7, 3, '.'],
      [8, 5, '.'],
      [7, 5, '.'],
      [8, 3, '.'],
      [7, 4, 'C'],
      [8, 4, 'C'],
    ]);
    expect(validateVersus(on(v3, bridge)).s).toBe(1);
    expect(errors(on(v3, bridge))).toMatch(/connected: counter at \(7, 4\)/);
    const oven = edit(v1.rows, [
      [7, 4, 'O'],
      [8, 4, 'O'],
    ]); // ovens in the barrier, each touching one kitchen: fine
    expect(validateVersus(on(v1, oven)).ok).toBe(true);
    const shared = edit(v3.rows, [
      [7, 3, '.'],
      [8, 5, '.'],
      [7, 5, '.'],
      [8, 3, '.'],
      [7, 4, 'O'],
      [8, 4, 'O'],
    ]); // ovens usable from both sides
    expect(errors(on(v3, shared))).toMatch(/station pot at \(7, 4\) touches both kitchens and is not declared shared/);
    expect(
      validateVersus({
        ...on(v3, shared),
        versus: {
          ...v3.versus,
          shared: [
            [7, 4],
            [8, 4],
          ],
        },
      }),
    ).toMatchObject({ ok: true, errors: [] }); // declared: allowed
  });

  it('players outside 2..8, too few spawns for the biggest team and too small a floor are reported', () => {
    expect(errors({ ...v1, nMax: 9 })).toMatch(/not within 2\.\.8/);
    const fewSpawns = edit(v1.rows, [
      [5, 6, '.'],
      [10, 6, '.'],
    ]);
    const sp = {
      ...v1.versus,
      spawns: [
        [
          [2, 5],
          [2, 6],
          [5, 5],
        ],
        [
          [13, 5],
          [13, 6],
          [10, 5],
        ],
      ] as VersusMapDef['versus']['spawns'],
    };
    expect(errors({ ...on(v1, fewSpawns), versus: sp })).toMatch(/kitchen A: 3 spawns for teams of up to 4/);
    const tiny = get('V5');
    expect(errors({ ...tiny, nMax: 8 })).toMatch(/floor tiles for teams of 4/);
  });

  it('a recipe station nobody can reach is an error even when the kitchens are twins', () => {
    const buried = edit(v1.rows, [
      [1, 1, 'C'],
      [2, 1, 'C'],
      [3, 1, 'C'],
      [1, 0, '1'],
      [14, 0, '1'],
    ]);
    const walled = edit(buried, [
      [12, 1, 'C'],
      [13, 1, 'C'],
      [14, 1, 'C'],
    ]);
    expect(errors(on(v1, walled))).toMatch(/has no floor next to it|missing station/);
  });
});

describe('mirrorize and the classification of the 15 coop maps', () => {
  const halves: HalfName[] = ['left', 'right', 'top', 'bottom'];
  const bestIsometry = (rows: readonly string[]) => Math.max(...Object.values(SIGMAS).map((s) => isometryCheck(rows, s).s));

  it('mirrorize copies one half, walls the barrier and reflects, leaving the coop rows untouched', () => {
    const rows = FIXED_MAPS.find((m) => m.id === '1')!.rows;
    const before = [...rows];
    const left = mirrorize(rows, 'left');
    expect(rows).toEqual(before);
    expect(left.sigma).toBe('mirrorX');
    expect(left.rows.every((r) => r.slice(7, 9) === '##')).toBe(true);
    expect(isometryCheck(left.rows, SIGMAS.mirrorX).s).toBe(1);
    const top = mirrorize(rows, 'top');
    expect(top.rows[4]).toBe('#'.repeat(16));
    expect(isometryCheck(top.rows, SIGMAS.rot180).s).toBe(1);
    for (const h of halves) expect(isometryCheck(mirrorize(rows, h).rows, SIGMAS[mirrorize(rows, h).sigma]).s, h).toBe(1);
  });

  it('every coop map carries its verdict: none is usable as it is (A), one derives a versus map (B), 14 are coop only (C)', () => {
    const grades = FIXED_MAPS.map((m) => m.versusFit?.grade);
    expect(grades.every(Boolean)).toBe(true);
    expect(grades.filter((g) => g === 'A')).toHaveLength(0);
    expect(
      FIXED_MAPS.filter((m) => m.versusFit!.grade === 'B').map((m) => `${m.id} ${m.versusFit!.half} -> ${m.versusFit!.derived}`),
    ).toEqual(['11 top -> 11-vs']);
    expect(grades.filter((g) => g === 'C')).toHaveLength(14);
    for (const m of FIXED_MAPS) expect(m.versusFit!.why.length, m.name).toBeGreaterThan(30);
  });

  it('the recorded symmetry is what the isometry check measures (best of mirror X, mirror Y, half turn)', () => {
    for (const m of FIXED_MAPS) {
      expect(Math.abs(m.versusFit!.s - bestIsometry(m.rows)), m.name).toBeLessThanOrEqual(0.0051); // two decimals
      expect(Math.abs(isometryCheck(m.rows, SIGMAS[m.versusFit!.sigma!]).s - m.versusFit!.s), m.name).toBeLessThanOrEqual(0.0051);
    }
  });

  it('grade B really derives a valid map, and no half of a grade C map does (the verdicts cannot lie)', () => {
    for (const m of FIXED_MAPS) {
      const ok = halves.filter((h) => validateVersus(deriveVersus(m, h)).ok);
      if (m.versusFit!.grade === 'B') expect(ok, m.name).toEqual([m.versusFit!.half]);
      else expect(ok, m.name).toEqual([]);
    }
  });

  it('Espejo (map 8), the design candidate, is C: its halves hold different crates and share ovens, delivery and plates in the middle', () => {
    const m = FIXED_MAPS.find((x) => x.id === '8')!;
    expect(m.versusFit!.grade).toBe('C');
    expect(isometryCheck(m.rows, SIGMAS.mirrorX).s).toBeLessThan(0.7);
    expect(m.rows[0]).toBe('#11#KK###KK#22##'); // dough crates on the left, tomato crates on the right
  });
});
