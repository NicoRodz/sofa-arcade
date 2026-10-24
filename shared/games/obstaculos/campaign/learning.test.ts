import { describe, expect, it } from 'vitest';
import { LEVELS } from '../levels';
import { CAMPAIGN } from './catalog';
import { learnCatalog, learnLevel, lintHints } from './learning';
import type { CampaignLevel } from './types';

const built = CAMPAIGN.filter((l) => l.status === 'built');
const swap = (ids: string[]): CampaignLevel[] => { const m = new Map(CAMPAIGN.map((l) => [l.id, l])); return ids.map((id) => m.get(id)!); };
const tweak = (id: string, f: (l: CampaignLevel) => void): CampaignLevel[] => CAMPAIGN.map((l) => { if (l.id !== id) return l; const c = { ...l }; f(c); return c; });
const idx = (levels: readonly CampaignLevel[], id: string) => levels.findIndex((l) => l.id === id);

describe('learning test (plan §8): the bot only knows what was taught', () => {
  for (const l of built) {
    it(`${l.id} ${l.name}: finishes with what is taught, stars and checkpoints reachable, D in band, hints ok`, { timeout: 60_000 }, () => {
      const r = learnLevel(CAMPAIGN, idx(CAMPAIGN, l.id));
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.stars).toBe('3/3');
    });
  }

  it('debut of each mechanic the validator models: without it the bot fails, with it the record shows at least one use', () => {
    const reports = Object.fromEntries(learnCatalog(CAMPAIGN).map((r) => [r.id, r]));
    const verified = (id: string) => reports[id]!.debut.filter((d) => d.kind === 'verified').map((d) => [d.mechanic, d.withoutFails, (d.usedWith ?? 0) >= 1]);
    expect(verified('1-1')).toEqual([['jump', true, true]]);
    expect(verified('1-3')).toEqual([['tower', true, true], ['hand', true, true]]);
    expect(verified('1-5')).toEqual([['throw', true, true]]);
    expect(verified('1-6')).toEqual([['swing', true, true]]);
  });
  it('what the validator cannot show yet is listed, not hidden: rope, signals and anchor wait for the sim bot of A2 (move and coyote are passive)', () => {
    const kinds = learnCatalog(CAMPAIGN).flatMap((r) => r.debut.map((d) => `${d.kind}:${d.mechanic}`));
    expect(kinds.filter((k) => k.startsWith('unverified')).sort()).toEqual(['unverified:anchor', 'unverified:rope', 'unverified:signals']);
    expect(kinds.filter((k) => k.startsWith('passive')).sort()).toEqual(['passive:coyote', 'passive:move']);
  });
  it('D of Mundo 1 sits in the Playa band (0-15, +-5 slack)', () => {
    for (const r of learnCatalog(CAMPAIGN)) { expect(r.d, r.id).toBeGreaterThan(0); expect(r.d, r.id).toBeLessThanOrEqual(20); }
  });

  describe('sabotage: each of these must be red', () => {
    it('putting 1-5 (throw) before 1-3 (tower, hand): the throw level needs the hand nobody has taught yet', () => {
      const order = swap(['1-1', '1-2', '1-5', '1-3', '1-4', '1-6', '1-7']);
      const r = learnLevel(order, idx(order, '1-5'));
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toMatch(/1-5 chain: not solvable with what is taught so far/);
      expect(r.errors.join('\n')).toMatch(/requires hand/);
      expect(learnCatalog(order).some((x) => !x.ok)).toBe(true);
    });
    it('putting 1-4 (anchor, needs tower and hand) before 1-3 is red too', () => {
      const order = swap(['1-1', '1-2', '1-4', '1-3', '1-5', '1-6', '1-7']);
      expect(learnLevel(order, idx(order, '1-4')).ok).toBe(false);
    });
    it('a hint of 10 words is red, so are 3 hints on a level and any hint on level 6 or 7', () => {
      const long = tweak('1-1', (l) => { l.def = { ...l.def!, hints: [{ x: 4, y: 9, text: 'Salta el muro con el botón A antes de que se acabe el tiempo' }] }; });
      expect(learnLevel(long, 0).errors.join()).toMatch(/hint ".*" has \d+ words, at most 6/);
      const three = tweak('1-1', (l) => { l.def = { ...l.def!, hints: [1, 2, 3].map((x) => ({ x, y: 9, text: 'Salta' })) }; });
      expect(learnLevel(three, 0).errors.join()).toMatch(/3 hints, at most 2/);
      const late = tweak('1-6', (l) => { l.def = { ...l.def!, hints: [{ x: 4, y: 9, text: 'Salta' }] }; });
      expect(learnLevel(late, idx(late, '1-6')).errors.join()).toMatch(/levels 6 and 7 of a world have no hints/);
      expect(lintHints(CAMPAIGN[1]!.def!, 2)).toEqual([]); // the real 1-2 has 2 hints of 5 words
    });
    it('taking the wall out of 1-3 makes the tower unnecessary: "still finishes" (a debut with no need is red)', () => {
      const flat = tweak('1-3', (l) => { l.def = { ...l.def!, rows: l.def!.rows.map((r) => r.replace(/#{6}/g, (m, off) => (off > 0 && r.indexOf(m) === off && r[off - 1] === '.' ? '......' : m))) }; });
      // (rows 8-11 hold the wall; the floor rows 12-13 are all '#', which the regexp above leaves alone when preceded by '#')
      const r = learnLevel(flat, idx(flat, '1-3'));
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toMatch(/still finishes: tower is not needed here/);
    });
    it('taking the ring out of 1-6 makes the level unsolvable', () => {
      const noRing = tweak('1-6', (l) => { l.def = { ...l.def!, rows: l.def!.rows.map((r) => r.replace('o', '.')) }; });
      expect(learnLevel(noRing, idx(noRing, '1-6')).errors.join('\n')).toMatch(/1-6 chain: not solvable/);
    });
    it('a hard existing level in the Playa slot is out of band (l12 as 1-1)', () => {
      const l12 = LEVELS.find((l) => l.id === 'l12')!;
      const hard = tweak('1-1', (l) => { l.def = { ...l12, id: '1-1', biome: 'beach', players: { min: 2, max: 2 }, tether: 'freeOnly', hints: [] }; l.mode = 'L'; });
      expect(learnLevel(hard, 0).errors.join('\n')).toMatch(/outside the Playa band/);
    });
    it('a level with no checkpoint on a long route is red', () => {
      const noCp = tweak('1-7', (l) => { l.def = { ...l.def!, rows: l.def!.rows.map((r) => r.replace(/P/g, '.')) }; });
      expect(learnLevel(noCp, idx(noCp, '1-7')).errors.join('\n')).toMatch(/checkpoints for a/);
    });
    it('a fourth star out of reach is red', () => {
      const lost = tweak('1-1', (l) => { l.def = { ...l.def!, rows: l.def!.rows.map((r, y) => (y === 5 ? r.slice(0, 30) + '*' + r.slice(31) : r)) }; });
      expect(learnLevel(lost, 0).errors.join('\n')).toMatch(/stars 3\/4/);
    });
  });
});
