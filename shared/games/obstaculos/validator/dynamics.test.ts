// What the validator models of the A5 dynamics (sim/campaign.ts header lists it): the throw niche, balance with 2, target, pickaxe climbs and ice friction in trajectories.
// Wind and soft enemies are NOT modelled on purpose (see the header of sim/campaign.ts): there is no test here that pretends they are.
import { describe, expect, it } from 'vitest';
import { TILE } from '../constants';
import type { Mechanic } from '../mechanics';
import { parseLevel } from '../parse';
import { campaignParams } from '../sim/campaign';
import type { EntityParam, LevelDef } from '../types';
import { buildGraph } from './graph';
import { lint, validateState } from './validate';

const only = (...m: Mechanic[]) => new Set<Mechanic>(m);
// 18 rows: floor on 15..17 (standing row 14), S at column 2 and G three columns from the right.
function flat(w: number, params?: Record<string, EntityParam>, extra: Partial<LevelDef> = {}, tether: LevelDef['tether'] = 'any'): string[] {
  const rows = Array.from({ length: 18 }, (_, y) => (y >= 15 ? '#'.repeat(w) : '.'.repeat(w)));
  rows[14] = rows[14]!.slice(0, 2) + 'S' + rows[14]!.slice(3, w - 3) + 'G' + rows[14]!.slice(w - 2);
  void params; void extra; void tether;
  return rows;
}
const set = (rows: string[], x: number, y: number, s: string): string[] => { const r = [...rows]; r[y] = r[y]!.slice(0, x) + s + r[y]!.slice(x + s.length); return r; };
const rect = (rows: string[], x0: number, y0: number, x1: number, y1: number, ch: string): string[] => { let r = rows; for (let y = y0; y <= y1; y++) r = set(r, x0, y, ch.repeat(x1 - x0 + 1)); return r; };
const def = (rows: string[], o: Partial<LevelDef> = {}): LevelDef => ({ id: 't', name: 't', biome: 'glacier', players: { min: 2, max: 2 }, tether: 'any', stars: 1, parSec: 60, rows, ...o });
const camp = (mode: 'chain' | 'free' = 'chain', allow?: ReadonlySet<Mechanic>) => ({ n: 2, mode, diff: 'hard' as const, world: 'forest' as const, ...(allow ? { allow } : {}) });

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('throw niche: the campaign throw crosses a pit that no jump or tower crosses when tied', () => {
  // floor to column 12, a `gap`-wide pit whose hazard (liquid) starts at `hazardRow`, floor again; standing row 14; S far left, G far right
  const pit = (gap: number, hazardRow: number): LevelDef => {
    const rows = Array.from({ length: 28 }, (_, y) => {
      const cs = '.'.repeat(50).split('');
      for (let x = 0; x < 50; x++) {
        if (y >= 15 && (x <= 12 || x >= 13 + gap)) cs[x] = '#';
        else if (y === hazardRow) cs[x] = '~';
        else if (y > hazardRow) cs[x] = '#';
      }
      if (y === 14) { cs[2] = 'S'; cs[46] = 'G'; }
      return cs.join('');
    });
    return def(rows, { tether: 'chainOnly', biome: 'beach' });
  };
  const beach = (allow?: ReadonlySet<Mechanic>) => ({ n: 2, mode: 'chain' as const, diff: 'hard' as const, world: 'beach' as const, ...(allow ? { allow } : {}) });
  it('a 5-tile pit: the bot without the throw cannot cross, the one with it crosses and the record shows the throw', () => {
    const d = pit(5, 22);
    const without = validateState(d, beach(only('jump', 'tower', 'hand')));
    expect(without.ok).toBe(false);
    expect(without.errors.join()).toMatch(/pioneer cannot reach G/);
    const withIt = validateState(d, beach(only('jump', 'tower', 'hand', 'throw')));
    expect(withIt.ok).toBe(true);
    expect(withIt.uses.throw).toBeGreaterThanOrEqual(1);
    expect(withIt.path.some((e) => e.kind === 'throw')).toBe(true);
    expect(withIt.followPath.some((e) => e.kind === 'throw')).toBe(true); // the thrower is pulled across afterwards
  });
  it('a 4-tile pit is still an ordinary jump (the throw adds range, it does not replace the jump)', () => {
    const r = validateState(pit(4, 22), beach(only('jump')));
    expect(r.ok).toBe(true);
    expect(r.uses.throw).toBeUndefined();
  });
  it('the pulled thrower hangs up to a rope below the far ledge: liquid 2 or 4 tiles below it is deadly (the followers cannot cross), 7 tiles below is fine', () => {
    expect(validateState(pit(5, 17), beach()).errors.join()).toMatch(/followers cannot reach G/);
    expect(validateState(pit(5, 19), beach()).errors.join()).toMatch(/followers cannot reach G/);
    expect(validateState(pit(5, 22), beach()).ok).toBe(true);
  });
  it('outside a campaign world nothing changed: the same pit is not crossed tied, and a 6-tile pit is out of reach in the campaign too', () => {
    expect(validateState(pit(5, 22), { n: 2, mode: 'chain', diff: 'hard' }).ok).toBe(false);
    expect(validateState(pit(6, 22), beach()).ok).toBe(false);
  });
  it('free mode: no rope, no niche (a plain jump already carries 5 tiles)', () => {
    const d = { ...pit(5, 22), tether: 'freeOnly' as const };
    const r = validateState(d, { n: 2, mode: 'free', diff: 'hard', world: 'beach', allow: only('jump') });
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('balance with 2 players in the campaign: alone on a plate it goes down (rides are one-way down); outside the campaign it needs 3', () => {
  const bparams: Record<string, EntityParam> = { D: { kind: 'balance', partner: 'E', travel: 3, speed: 1 }, E: { kind: 'balance', partner: 'D', travel: 3, speed: 1 } };
  const rows = set(set(flat(40), 10, 10, 'DD'), 20, 10, 'EE');
  const d = def(rows, { params: bparams });
  const edges = (env: Parameters<typeof buildGraph>[1]) => {
    const p = parseLevel(d);
    const g = buildGraph(p, env, { open: new Set(), doors: new Set() }, [], { pioneer: true });
    return g.adj.flat().filter((e) => e.kind === 'ride');
  };
  it('campaign, n=2: ride edges exist, all of them downwards and none needs a partner', () => {
    const e = edges({ n: 2, mode: 'chain', diff: 'hard', world: 'forest' });
    expect(e.length).toBeGreaterThan(0);
    expect(e.every((x) => x.rise < 0 && !x.coop)).toBe(true);
  });
  it('campaign, n=3: both ways, cooperative (the counts decide)', () => {
    const e = edges({ n: 3, mode: 'chain', diff: 'hard', world: 'forest' });
    expect(e.some((x) => x.rise > 0)).toBe(true);
    expect(e.every((x) => x.coop)).toBe(true);
  });
  it('legacy, n=2: the balance cannot be used with two (both plates must be loaded): no ride edges, as before', () => {
    expect(edges({ n: 2, mode: 'chain', diff: 'hard' })).toEqual([]);
  });
  it('the far positions of the plates exist in the terrain of a campaign validation (the rider lands on the lower one), not outside it', () => {
    const p = parseLevel(d);
    const gc = buildGraph(p, { n: 2, mode: 'chain', diff: 'hard', world: 'forest' }, { open: new Set(), doors: new Set() }, [], { pioneer: true });
    const gl = buildGraph(p, { n: 2, mode: 'chain', diff: 'hard' }, { open: new Set(), doors: new Set() }, [], { pioneer: true });
    const lowRow = 10 + 3; // the lower position of D
    expect(gc.grid.cells[lowRow * gc.grid.w + 10]).not.toBe(0);
    expect(gl.grid.cells[lowRow * gl.grid.w + 10]).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('target: a gate that only opens when somebody flies through the diana', () => {
  const tparams: Record<string, EntityParam> = { a: { kind: 'target', opens: 'A' }, A: { kind: 'gate' } };
  // a 7-tall gate in the way (column 24), the target in the air in front of it (columns 18-19, rows 11-12: a jump from the floor passes through it)
  const level = (targetCol = 18) => def(rect(rect(flat(40), 24, 7, 24, 14, 'A'), targetCol, 11, targetCol + 1, 12, 'a'), { params: tparams });
  it('without the target the gate stays shut; knowing it, the bot opens the gate and the record counts one use', () => {
    const closed = validateState(level(), camp('free', only('jump')));
    expect(closed.ok).toBe(false);
    expect(closed.errors.join()).toMatch(/pioneer cannot reach G/);
    const open = validateState(level(), camp('free', only('jump', 'target')));
    expect(open.ok).toBe(true);
    expect(open.uses.target).toBe(1);
    expect(open.opened).toEqual(['A']);
  });
  it('a target too far from its gate for the 4 s it stays open is a lint error (20 tiles at the run speed with a quarter in hand)', () => {
    expect(lint(parseLevel(level()))).toEqual([]);
    const far = def(rect(rect(flat(60), 50, 7, 50, 14, 'A'), 18, 11, 19, 12, 'a'), { params: tparams });
    expect(lint(parseLevel(far)).join()).toMatch(/target 'a' is \d+ tiles from its gate 'A': at most 20/);
  });
  it('the gate is not a gadget with no opener any more: a gate with only a target counts as having an activator', () => {
    expect(lint(parseLevel(level())).join()).not.toMatch(/has no activator/);
    const noTarget = def(rect(flat(40), 24, 7, 24, 14, 'A'), { params: { A: { kind: 'gate' } } });
    expect(lint(parseLevel(noTarget)).join()).toMatch(/gate 'A' has no activator/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
describe('pickaxe: an ice wall taller than any tower is climbed by whoever carries it, and the partner follows', () => {
  // a 7-tall wall (rows 8..14) with ice on its left face (column 20) and rock behind; the pickaxe lies on the floor in front of it
  const wall = (pick = true) => def(set(rect(rect(flat(40), 20, 8, 20, 14, 'I'), 21, 8, 24, 14, '#'), 10, 14, pick ? 'p' : '.'), { tether: 'chainOnly' });
  it('without the pickaxe the wall is out of reach; with it the pioneer climbs and the record shows the climb (followers use the edge too)', () => {
    const none = validateState(wall(), camp('chain', only('jump', 'tower', 'hand', 'throw')));
    expect(none.ok).toBe(false);
    expect(none.errors.join()).toMatch(/pioneer cannot reach G/);
    const yes = validateState(wall(), camp('chain', only('jump', 'tower', 'hand', 'pickaxe')));
    expect(yes.ok).toBe(true);
    expect(yes.uses.pickaxe).toBeGreaterThanOrEqual(1);
    expect(yes.path.some((e) => e.kind === 'climb')).toBe(true);
    expect(yes.followPath.some((e) => e.kind === 'climb')).toBe(true);
  });
  it('a level with no pickaxe item, or one the pioneer cannot reach, is not solvable even if the mechanic is known', () => {
    expect(validateState(wall(false), camp('chain', only('jump', 'pickaxe'))).ok).toBe(false);
    const behind = def(set(rect(rect(flat(40), 20, 8, 20, 14, 'I'), 21, 8, 24, 14, '#'), 22, 7, 'p'), { tether: 'chainOnly' }); // the item sits on top of the wall
    expect(validateState(behind, camp('chain', only('jump', 'pickaxe'))).ok).toBe(false);
  });
  it('the climb is not capped by the rope (a 7-tile wall, 336 px, against a 201.6 px rope): that is its niche over the tower', () => {
    const c = campaignParams(2, 'forest');
    expect(7 * TILE).toBeGreaterThan(c.ropeLen);
    expect(validateState(wall(), camp('chain')).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Ice in the validator is just the friction parameter: every trajectory is a run of the real stepPlayer, so a slow start on ice is in it (the air is not slippery, so the
// effect on a jump is small); what happens AFTER landing (sliding off a small island) is not modelled: that is the real-sim bot's to show.
describe('ice in the validator: the trajectories run with the campaign friction', () => {
  it('the legacy parameters have no friction field: ice tiles grip like rock', () => {
    const p = parseLevel(def(flat(40)));
    const legacy = buildGraph(p, { n: 2, mode: 'chain', diff: 'hard' }, { open: new Set(), doors: new Set() }, [], { pioneer: true });
    expect(legacy.params.iceFriction).toBeUndefined();
    const c = buildGraph(p, { n: 2, mode: 'chain', diff: 'hard', world: 'forest' }, { open: new Set(), doors: new Set() }, [], { pioneer: true });
    expect(c.params.iceFriction).toBe(0.15);
  });
});
