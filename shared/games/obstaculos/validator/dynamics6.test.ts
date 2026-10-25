// What the validator models of the A6 dynamics (header of sim/campaign.ts lists it): crystals count as lit, the elastic ring is a plain ring, a sinker is a still one-way platform,
// a geyser vent is a spring. The sinking, the geyser's period, the lantern's carrier and the bungee's extra reach are NOT modelled, and no test here pretends they are.
import { describe, expect, it } from 'vitest';
import type { Mechanic } from '../mechanics';
import { Canvas } from '../modules/dsl';
import { flatCap, toLevel } from '../generate/assemble';
import type { EntityParam, LevelDef } from '../types';
import { lint, validateState } from './validate';

const only = (...m: Mechanic[]) => new Set<Mechanic>(m);
// 18 rows: floor on 15..17 (standing row 14), S at column 2 and G three columns from the right.
function flat(w: number): string[] {
  const rows = Array.from({ length: 18 }, (_, y) => (y >= 15 ? '#'.repeat(w) : '.'.repeat(w)));
  rows[14] = rows[14]!.slice(0, 2) + 'S' + rows[14]!.slice(3, w - 3) + 'G' + rows[14]!.slice(w - 2);
  return rows;
}
const set = (rows: string[], x: number, y: number, s: string): string[] => {
  const r = [...rows];
  r[y] = r[y]!.slice(0, x) + s + r[y]!.slice(x + s.length);
  return r;
};
const rect = (rows: string[], x0: number, y0: number, x1: number, y1: number, ch: string): string[] => {
  let r = rows;
  for (let y = y0; y <= y1; y++) r = set(r, x0, y, ch.repeat(x1 - x0 + 1));
  return r;
};
const def = (rows: string[], o: Partial<LevelDef> & { params?: Record<string, EntityParam> } = {}): LevelDef => ({
  id: 't',
  name: 't',
  biome: 'mine',
  players: { min: 2, max: 2 },
  tether: 'any',
  stars: 1,
  parSec: 60,
  rows,
  ...o,
});
const env = (allow?: ReadonlySet<Mechanic>) => ({
  n: 2,
  mode: 'chain' as const,
  diff: 'hard' as const,
  world: 'mine' as const,
  ...(allow ? { allow } : {}),
});

describe('dynamic 10: crystals count as lit when the level has a lantern', () => {
  it('a crystal wall 7 tiles tall blocks the route like rock; a one-tile crystal step is climbed like rock', () => {
    const wall = def(set(rect(flat(40), 18, 8, 18, 14, 'Y'), 4, 14, 'l'), { tether: 'chainOnly' });
    expect(validateState(wall, env()).ok).toBe(false);
    const step = def(set(rect(flat(40), 18, 14, 18, 14, 'Y'), 4, 14, 'l'), { tether: 'chainOnly' });
    expect(validateState(step, env()).ok).toBe(true);
  });
  it('lint: crystals with no lantern is an error (nothing ever lights them); with one it is fine', () => {
    expect(lint(parse(def(rect(flat(40), 18, 12, 18, 14, 'Y')))).join()).toMatch(/3 crystals .* no lantern/);
    expect(lint(parse(def(set(rect(flat(40), 18, 12, 18, 14, 'Y'), 4, 14, 'l')))).join()).not.toMatch(/crystals/);
  });
});

describe('dynamic 11: the elastic ring is modelled as a plain ring', () => {
  // an abyss (the same as validate.test.ts uses for the ring): crossed only by a bot that knows how to swing from a ring above it
  const abyss = (ring: string) => {
    const c = new Canvas(18).pit(4, 10, '~').set(4, 12, ring);
    const lvl = toLevel([flatCap(6, { ch: 'S', x: 2 }), { w: c.w, rows: c.rows() }, flatCap(6, { ch: 'G', x: 3 })], {
      id: 't',
      name: 't',
      biome: 'mine',
      players: { min: 2, max: 8 },
      tether: 'chainOnly',
      stars: 1,
      parSec: 60,
    });
    return lvl;
  };
  const known = (...m: Mechanic[]) => new Set<Mechanic>(m);
  it('a "u" ring bridges the abyss for a bot that knows how to swing, exactly like an "o" ring (same swing use), and for nobody else', () => {
    for (const ring of ['o', 'u']) {
      expect(
        validateState(abyss(ring), { n: 2, mode: 'chain', diff: 'hard', world: 'mine', allow: known('jump', 'tower', 'hand') }).ok,
        `${ring} without swing`,
      ).toBe(false);
      const r = validateState(abyss(ring), { n: 2, mode: 'chain', diff: 'hard', world: 'mine', allow: known('jump', 'swing') });
      expect(r.ok, `${ring} with swing: ${r.errors.join()}`).toBe(true);
      expect(r.uses.swing, ring).toBeGreaterThanOrEqual(1);
    }
  });
  it('lint: a freeOnly level may not have an elastic ring either (rings need the rope)', () => {
    const def = { ...abyss('u'), tether: 'freeOnly' as const };
    expect(lint(parse(def)).join()).toMatch(/rings only work tied/);
  });
});

describe('dynamic 12: sinker = a still one-way platform, geyser = a spring under the vent', () => {
  it('a rock floating over a pit is walked across (as a platform at rest)', () => {
    let rows = flat(40);
    rows = rect(rows, 14, 15, 21, 17, '~'); // 8-wide water pit
    rows = set(rows, 16, 14, 'DDDD');
    const r = validateState(def(rows, { params: { D: { kind: 'sinker', travel: 2 } }, tether: 'chainOnly' }), env());
    expect(r.errors).toEqual([]);
  });
  it('a vent under a ledge 6 tiles up gets the route there (the spring model), and without it the same ledge is out of reach', () => {
    let rows = flat(40);
    rows = rect(rows, 24, 9, 30, 9, '#'); // a ledge 5 tiles above the floor (standing row 8), 2 tiles from the vent
    rows = rect(rows, 24, 10, 24, 14, '#'); // a wall under it
    rows = set(rows, 28, 8, 'G');
    rows = set(rows, 37, 14, '.');
    rows = set(rows, 22, 14, 'E');
    const withVent = def(rows, { params: { E: { kind: 'geyser', periodSec: 4, activeSec: 0.5 } }, tether: 'freeOnly' });
    const noVent = def(set(rows, 22, 14, '.'), { tether: 'freeOnly' });
    const free = { ...env(), mode: 'free' as const }; // tied, the rope (4.2 tiles) caps any rise above it for the validator, spring or not (same as a boya)
    expect(validateState(noVent, free).ok).toBe(false);
    expect(validateState(withVent, free).errors).toEqual([]);
  });
  it('lint: a geyser vent needs a solid floor under it; a sinker may not leave the grid', () => {
    const noFloor = rect(flat(40), 20, 15, 20, 17, '.');
    expect(lint(parse(def(set(noFloor, 20, 14, 'E'), { params: { E: { kind: 'geyser', periodSec: 4 } } }))).join()).toMatch(
      /geyser 'E' vent .* no solid floor/,
    );
    expect(lint(parse(def(set(flat(40), 10, 16, 'D'), { params: { D: { kind: 'sinker', travel: 3 } } }))).join()).toMatch(
      /'D' sinker leaves the grid/,
    );
  });
});

import { parseLevel } from '../parse';
const parse = parseLevel;
