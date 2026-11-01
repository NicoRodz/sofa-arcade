import { describe, expect, it } from 'vitest';
import { LEVELS } from '../levels';
import { difficultyOf } from '../metric';
import { validateState } from '../validator';
import { CAMPAIGN, campaignLevel, catalogErrors } from './catalog/catalog';
import { lintHints } from './progress/learning';
import { inBand, bandOf } from './worlds/world';
import { campaignParams } from '../sim/rules/campaign';
import type { CampaignLevel } from './catalog/types';

describe('the catalog: 5 worlds x 7 + 5 Cumbres = 40 (plan §2)', () => {
  it('has 40 levels in order, 7 per world, 5 Cumbres, a boss at the end of each world', () => {
    expect(CAMPAIGN).toHaveLength(40);
    expect(CAMPAIGN.map((l) => l.order)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    for (const w of ['beach', 'forest', 'glacier', 'mine', 'volcano'] as const) {
      const ls = CAMPAIGN.filter((l) => l.world === w);
      expect(
        ls.map((l) => l.index),
        w,
      ).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(ls.filter((l) => l.boss).map((l) => l.index)).toEqual([7]);
    }
    expect(CAMPAIGN.filter((l) => l.world === 'summit').map((l) => l.id)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
    expect(CAMPAIGN.filter((l) => l.origin === 'new' && l.world === 'summit')).toHaveLength(2); // 3 R? + 2 N
    expect(campaignLevel('2-2').introduces).toEqual(['spring', 'superjump']);
  });
  it('is well formed: unique ids, each mechanic introduced once, requires taught earlier, tilemap matches slot, mode and N=2', () => {
    expect(catalogErrors()).toEqual([]);
  });
  it('Mundos 1, 2 and 3 are built (A3 and A5); Mundos 4-5 and the Cumbres wait for A6 and A7 with metadata only', () => {
    const ids = (w: number) => [1, 2, 3, 4, 5, 6, 7].map((i) => `${w}-${i}`);
    expect(CAMPAIGN.filter((l) => l.status === 'built').map((l) => l.id)).toEqual([...ids(1), ...ids(2), ...ids(3)]);
    expect(CAMPAIGN.filter((l) => l.status === 'planned').map((l) => l.id)).toEqual([...ids(4), ...ids(5), 'C1', 'C2', 'C3', 'C4', 'C5']);
    expect(CAMPAIGN.filter((l) => l.status === 'planned').every((l) => !l.def && l.validatedFor.length === 0)).toBe(true);
    expect(CAMPAIGN.filter((l) => l.status === 'built').every((l) => l.validatedFor.join() === '2')).toBe(true);
  });
  it('what each new world teaches, level by level (plan §2 table, with the deviations in the notes)', () => {
    const taught = (w: string) => CAMPAIGN.filter((l) => l.id.startsWith(w)).map((l) => `${l.id} ${l.introduces.join('+') || '-'}`);
    expect(taught('2-')).toEqual([
      '2-1 ladder',
      '2-2 spring+superjump',
      '2-3 balance',
      '2-4 plate+target',
      '2-5 key',
      '2-6 softEnemies',
      '2-7 -',
    ]);
    expect(taught('3-')).toEqual(['3-1 ice', '3-2 wind', '3-3 mover', '3-4 pickaxe', '3-5 -', '3-6 -', '3-7 -']);
    expect(CAMPAIGN.filter((l) => l.status === 'built').map((l) => l.mode)).toEqual([
      'L',
      'E',
      'E',
      'E',
      'E',
      'E',
      'E',
      'E',
      'E',
      'E',
      'E',
      'E/L',
      'L',
      'E',
      'E',
      'E',
      'E',
      'E',
      'E',
      'E',
      'E',
    ]);
  });
  it('every level of Mundos 2 and 3 has at most 2 hints of at most 6 words, none in levels 6 and 7, and a hint on the level that introduces something with a modelled rule', () => {
    for (const l of CAMPAIGN.filter((x) => x.status === 'built' && x.world !== 'beach')) {
      expect(lintHints(l.def!, l.index), l.id).toEqual([]);
      if (l.index >= 6) expect(l.def!.hints ?? [], l.id).toEqual([]);
    }
    for (const id of ['2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3', '3-4', '3-5'])
      expect(CAMPAIGN.find((l) => l.id === id)!.def!.hints?.length ?? 0, id).toBeGreaterThanOrEqual(1);
  });
  it('the campaign levels live only in the campaign: the quick match pool is still the 15 levels and none of the 21 built campaign tilemaps is in it', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 15 }, (_, i) => `l${String(i + 1).padStart(2, '0')}`));
    const quick = new Set(LEVELS.map((l) => l.id));
    for (const l of CAMPAIGN) expect(quick.has(l.id), l.id).toBe(false);
    // the relocated 3-7 is a copy of l12 for 2 players, not l12 itself: the quick match keeps its own Avalancha (2-8 players, Libres and Encadenados)
    expect(LEVELS.find((l) => l.id === 'l12')!.players).toEqual({ min: 2, max: 8 });
    expect(campaignLevel('3-7').def!.hazard).toEqual(LEVELS.find((l) => l.id === 'l12')!.hazard);
  });
  it('every built level has 3 collectibles on its tilemap and a world-valid id', () => {
    for (const l of CAMPAIGN.filter((x) => x.def)) expect(l.collectibles, l.id).toHaveLength(3);
  });

  it('sabotage: teaching a mechanic twice, requiring one not yet taught, or a wrong tether is red', () => {
    const copy = (f: (l: CampaignLevel[]) => void) => {
      const l = CAMPAIGN.map((x) => ({ ...x }));
      f(l);
      return catalogErrors(l);
    };
    expect(
      copy((l) => {
        l[3]!.introduces = ['tower'];
      }).join(),
    ).toMatch(/1-4: introduces tower, already taught/);
    expect(
      copy((l) => {
        l[0]!.requires = ['swing'];
      }).join(),
    ).toMatch(/1-1: requires swing/);
    expect(
      copy((l) => {
        l[1]!.mode = 'L';
      }).join(),
    ).toMatch(/1-2: mode L wants tether freeOnly/);
    expect(
      copy((l) => {
        l[2]!.def = { ...l[2]!.def!, players: { min: 2, max: 8 } };
      }).join(),
    ).toMatch(/1-3: validated for 2 players only/);
  });
});

describe('relocating the 15 existing levels (plan §2 "Reubicacion"): same biome, N=2 viable, D in the world band', () => {
  const d2 = (id: string): number => {
    const def = LEVELS.find((l) => l.id === id)!;
    const modes = def.tether === 'chainOnly' ? ['chain'] : def.tether === 'freeOnly' ? ['free'] : ['chain', 'free'];
    const ds = modes.map((m) => difficultyOf(validateState(def, { n: 2, mode: m as 'chain' | 'free', diff: 'hard' }), def).D);
    return Math.max(...ds);
  };
  it('3-7 Jefe: Avalancha takes l12 (glacier, D 54-56, band 35-55)', () => {
    const slot = campaignLevel('3-7');
    expect(slot.candidate).toBe('l12');
    const l = LEVELS.find((x) => x.id === slot.candidate)!;
    expect(l.biome).toBe('glacier');
    expect(l.players.min).toBeLessThanOrEqual(2);
    expect(inBand(slot.world, d2('l12'))).toBe(true);
  });
  it('the rest do not qualify (D far from their world band, or they need 3+ players): l02 and l03 above Playa, l07, l09, l13, l14 below their band', () => {
    const qualifies = (id: string, world: Parameters<typeof inBand>[0]) => {
      const l = LEVELS.find((x) => x.id === id)!;
      return l.players.min <= 2 && inBand(world, d2(id));
    };
    expect(qualifies('l02', 'beach')).toBe(false);
    expect(qualifies('l03', 'beach')).toBe(false);
    expect(qualifies('l07', 'mine')).toBe(false);
    expect(qualifies('l09', 'mine')).toBe(false);
    expect(qualifies('l13', 'volcano')).toBe(false);
    expect(qualifies('l14', 'volcano')).toBe(false);
    // in band but with no slot that teaches what they use (A5 decides): l01 in Playa, l04 and l05 in Bosque
    expect(qualifies('l01', 'beach')).toBe(true);
    expect(qualifies('l04', 'forest')).toBe(true);
    expect(qualifies('l05', 'forest')).toBe(true);
    expect(qualifies('l10', 'glacier')).toBe(true); // D 30.4, on the slack of the Glaciar band: 3-1 teaches ice, which l10 does not have
  });
  it("the world bands are S1's (0..1) x 100", () => {
    expect(bandOf('beach')).toEqual([0, 15]);
    expect(bandOf('volcano')).toEqual([65, 90]);
    expect(campaignParams(2, 'beach').band).toEqual([0, 0.15]);
  });
});
