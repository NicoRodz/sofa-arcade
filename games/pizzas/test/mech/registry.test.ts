/// <reference types="node" />
// The registry: twelve stubs, one per id, in the order of the design, each documented with the tanda that implements it, with every companion piece wired.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MECH_IDS, MECH_TANDA, mechFlagsOf } from '../../sim/mech/ids';
import { MECH_MODULES, mechModule } from '../../sim/mech/registry';
import { MECH_ART } from '../../screen/art/mech/registry';
import { MECH_BOTS } from '../../../../tools/carta-larga/mech-bots';

const HOOKS = [
  'onLoad',
  'init',
  'beforeMove',
  'canEnter',
  'friction',
  'claimsB',
  'onInteract',
  'tickStations',
  'tickTiles',
  'mutation',
  'hashExtra',
  'ovenRate',
  'onFire',
] as const;

describe('mechanics registry', () => {
  it('has the twelve ids once each, in order', () => {
    expect(MECH_MODULES.map((m) => m.id)).toEqual([...MECH_IDS]);
    expect(MECH_IDS).toEqual([
      'kneader',
      'woodOven',
      'gate',
      'oil',
      'sprinkler',
      'bridge',
      'oneWay',
      'raft',
      'beltReverse',
      'ovenHeat',
      'heavyTray',
      'mutation',
    ]);
  });
  it('every module implements every hook and names its tanda', () => {
    for (const m of MECH_MODULES) {
      for (const h of HOOKS) expect(typeof m[h], `${m.id}.${h}`).toBe('function');
      expect(m.tanda).toBe(MECH_TANDA[m.id]);
      expect(m.validate([], 2)).toEqual([]);
      expect(Array.isArray(m.stamp.template)).toBe(true); // a stub's is empty, a tanda's holds its sub-grid
      expect(mechModule(m.id)).toBe(m);
    }
  });
  it('each stub folder documents the tanda, and art, bot, validator and stamp exist per id', () => {
    const root = new URL('../../', import.meta.url).pathname;
    for (const id of MECH_IDS) {
      expect(MECH_ART[id].draw).toBeTypeOf('function');
      expect(MECH_BOTS[id].wants).toBeTypeOf('function');
      for (const f of [
        `sim/mech/${id}/module.ts`,
        `sim/validate/mech/${id}.ts`,
        `sim/gen/stamps/${id}.ts`,
        `screen/art/mech/${id}/draw.ts`,
      ]) {
        expect(readFileSync(root + f, 'utf8'), f).toMatch(new RegExp(`Implemented by ${MECH_TANDA[id]}|implemented by ${MECH_TANDA[id]}`));
      }
    }
  });
  it('a map that declares mechanics turns exactly those flags on; none declared means no flags at all', () => {
    expect(mechFlagsOf(undefined)).toBeUndefined();
    expect(mechFlagsOf([])).toBeUndefined();
    expect(mechFlagsOf(['gate', 'oil'])).toEqual({ gate: true, oil: true });
  });
});
