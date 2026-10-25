import { describe, expect, it } from 'vitest';
import { LEVELS } from '../levels';
import { CAMPAIGN, campaignLevel } from './catalog';
import { learnCatalog, learnLevel, lintHints } from './learning';
import { inBand } from './world';
import type { CampaignLevel } from './types';

const built = CAMPAIGN.filter((l) => l.status === 'built');
const swap = (ids: string[]): CampaignLevel[] => {
  const m = new Map(CAMPAIGN.map((l) => [l.id, l]));
  return ids.map((id) => m.get(id)!);
};
const tweak = (id: string, f: (l: CampaignLevel) => void): CampaignLevel[] =>
  CAMPAIGN.map((l) => {
    if (l.id !== id) return l;
    const c = { ...l };
    f(c);
    return c;
  });
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
    const verified = (id: string) =>
      reports[id]!.debut.filter((d) => d.kind === 'verified').map((d) => [d.mechanic, d.withoutFails, (d.usedWith ?? 0) >= 1]);
    expect(verified('1-1')).toEqual([['jump', true, true]]);
    expect(verified('1-3')).toEqual([
      ['tower', true, true],
      ['hand', true, true],
    ]);
    expect(verified('1-5')).toEqual([['throw', true, true]]); // the 5-tile pit: no more "tower and throw are twins"
    expect(verified('1-6')).toEqual([['swing', true, true]]);
    expect(verified('2-1')).toEqual([['ladder', true, true]]);
    expect(verified('2-2')).toEqual([
      ['spring', true, true],
      ['superjump', true, true],
    ]);
    expect(verified('2-3')).toEqual([['balance', true, true]]);
    expect(verified('2-4')).toEqual([
      ['plate', true, true],
      ['target', true, true],
    ]);
    expect(verified('2-5')).toEqual([['key', true, true]]);
    expect(verified('3-3')).toEqual([['mover', true, true]]);
    expect(verified('3-4')).toEqual([['pickaxe', true, true]]);
    // and no level of Mundos 2-3 is left with a modelled debut that skipped the check
    for (const l of built)
      for (const d of reports[l.id]!.debut)
        if (d.kind === 'verified') expect(d.withoutFails && (d.usedWith ?? 0) >= 1, `${l.id} ${d.mechanic}`).toBe(true);
  });
  it('what the validator cannot show is listed, not hidden: rope, signals, anchor, softEnemies, ice and wind wait for the real-sim tests (move and coyote are passive)', () => {
    const kinds = learnCatalog(CAMPAIGN).flatMap((r) => r.debut.map((d) => `${d.kind}:${d.mechanic}`));
    expect(kinds.filter((k) => k.startsWith('unverified')).sort()).toEqual([
      'unverified:anchor',
      'unverified:ice',
      'unverified:rope',
      'unverified:signals',
      'unverified:softEnemies',
      'unverified:wind',
    ]);
    expect(kinds.filter((k) => k.startsWith('passive')).sort()).toEqual(['passive:coyote', 'passive:move']);
  });
  it("D of every level sits in its world's band (+-5 slack): Playa 0-15, Bosque 15-35, Glaciar 35-55", () => {
    const reports = learnCatalog(CAMPAIGN);
    for (const r of reports) {
      const l = CAMPAIGN.find((x) => x.id === r.id)!;
      expect(r.d, r.id).toBeGreaterThan(0);
      expect(inBand(l.world, r.d), `${r.id} D ${r.d.toFixed(1)}`).toBe(true);
    }
    const d = (id: string) => reports.find((r) => r.id === id)!.d;
    expect(Math.max(...['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7'].map(d))).toBeLessThanOrEqual(20);
    expect(Math.min(...['3-1', '3-2', '3-3', '3-4', '3-5', '3-6', '3-7'].map(d))).toBeGreaterThanOrEqual(30); // the Glaciar is harder than the Bosque
  });

  describe('sabotage: each of these must be red', () => {
    it('putting 2-7 (needs ladder and spring) before 2-1 and 3-6 (needs superjump and pickaxe) before 3-4 are red: the order check', () => {
      const early = CAMPAIGN.filter((l) => l.id !== '2-7');
      early.splice(
        early.findIndex((l) => l.id === '2-1'),
        0,
        campaignLevel('2-7'),
      );
      const r = learnLevel(
        early,
        early.findIndex((l) => l.id === '2-7'),
      );
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toMatch(/2-7: requires ladder, which no earlier level taught/);
      const late = CAMPAIGN.filter((l) => l.id !== '3-6');
      late.splice(
        late.findIndex((l) => l.id === '3-4'),
        0,
        campaignLevel('3-6'),
      );
      const q = learnLevel(
        late,
        late.findIndex((l) => l.id === '3-6'),
      );
      expect(q.ok).toBe(false);
      expect(q.errors.join('\n')).toMatch(/3-6: requires pickaxe, which no earlier level taught/);
    });
    it('putting 1-4 (anchor, needs tower and hand) before 1-3 is red too', () => {
      const order = swap(['1-1', '1-2', '1-4', '1-3', '1-5', '1-6', '1-7']);
      expect(learnLevel(order, idx(order, '1-4')).ok).toBe(false);
    });
    it('a hint of 10 words is red, so are 3 hints on a level and any hint on level 6 or 7', () => {
      const long = tweak('1-1', (l) => {
        l.def = { ...l.def!, hints: [{ x: 4, y: 9, text: 'Salta el muro con el botón A antes de que se acabe el tiempo' }] };
      });
      expect(learnLevel(long, 0).errors.join()).toMatch(/hint ".*" has \d+ words, at most 6/);
      const three = tweak('1-1', (l) => {
        l.def = { ...l.def!, hints: [1, 2, 3].map((x) => ({ x, y: 9, text: 'Salta' })) };
      });
      expect(learnLevel(three, 0).errors.join()).toMatch(/3 hints, at most 2/);
      const late = tweak('1-6', (l) => {
        l.def = { ...l.def!, hints: [{ x: 4, y: 9, text: 'Salta' }] };
      });
      expect(learnLevel(late, idx(late, '1-6')).errors.join()).toMatch(/levels 6 and 7 of a world have no hints/);
      expect(lintHints(CAMPAIGN[1]!.def!, 2)).toEqual([]); // the real 1-2 has 2 hints of 5 words
    });
    it('taking the wall out of 1-3 makes the tower unnecessary: "still finishes" (a debut with no need is red)', () => {
      const flat = tweak('1-3', (l) => {
        l.def = {
          ...l.def!,
          rows: l.def!.rows.map((r) =>
            r.replace(/#{6}/g, (m, off) => (off > 0 && r.indexOf(m) === off && r[off - 1] === '.' ? '......' : m)),
          ),
        };
      });
      // (rows 8-11 hold the wall; the floor rows 12-13 are all '#', which the regexp above leaves alone when preceded by '#')
      const r = learnLevel(flat, idx(flat, '1-3'));
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toMatch(/still finishes: tower is not needed here/);
    });
    it('taking the ring out of 1-6 makes the level unsolvable', () => {
      const noRing = tweak('1-6', (l) => {
        l.def = { ...l.def!, rows: l.def!.rows.map((r) => r.replace('o', '.')) };
      });
      expect(learnLevel(noRing, idx(noRing, '1-6')).errors.join('\n')).toMatch(/1-6 chain: not solvable/);
    });
    // --- A5: every Bosque / Glaciar level that teaches a modelled mechanic must go red when its obstacle is made trivial or its tool is taken away
    const edit = (id: string, f: (g: string[][]) => void): CampaignLevel[] =>
      tweak(id, (l) => {
        const g = l.def!.rows.map((r) => r.split(''));
        f(g);
        l.def = { ...l.def!, rows: g.map((r) => r.join('')) };
      });
    const fill = (g: string[][], x0: number, y0: number, x1: number, y1: number, ch: string) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y]![x] = ch;
    };
    const errs = (levels: CampaignLevel[], id: string) => learnLevel(levels, idx(levels, id)).errors.join('\n');
    it('1-5: filling the 5-tile pit, or narrowing it to 4 tiles (a plain jump), makes the throw unnecessary; water 2 rows under the far ledge leaves the pulled partner nowhere to hang', () => {
      expect(
        errs(
          edit('1-5', (g) => fill(g, 32, 12, 36, 19, '#')),
          '1-5',
        ),
      ).toMatch(/1-5 chain: the bot without throw still finishes: throw is not needed here/);
      expect(
        errs(
          edit('1-5', (g) => fill(g, 36, 12, 36, 19, '#')),
          '1-5',
        ),
      ).toMatch(/the bot without throw still finishes/);
      expect(
        errs(
          edit('1-5', (g) => fill(g, 32, 14, 36, 14, '~')),
          '1-5',
        ),
      ).toMatch(/followers cannot reach G/);
    });
    it('2-1: taking the ladders away leaves a 7-tile trunk nobody climbs; 2-2: a 3-tile ledge needs no super jump and no springs leaves the wide pit open', () => {
      expect(
        errs(
          edit('2-1', (g) =>
            g.forEach((r) =>
              r.forEach((c, x) => {
                if (c === '|') r[x] = '.';
              }),
            ),
          ),
          '2-1',
        ),
      ).toMatch(/2-1 chain: not solvable/);
      expect(
        errs(
          edit('2-2', (g) => fill(g, 57, 9, 82, 9, '.')),
          '2-2',
        ),
      ).toMatch(/the bot without superjump still finishes: superjump is not needed here/);
      expect(
        errs(
          edit('2-2', (g) =>
            g.forEach((r) =>
              r.forEach((c, x) => {
                if (c === 'T') r[x] = '.';
              }),
            ),
          ),
          '2-2',
        ),
      ).toMatch(/2-2 chain: not solvable/);
    });
    it('2-3: opening the mountain lets the pair walk off the platform without the balance (the enclosed tunnel is what makes it necessary)', () => {
      const open = edit('2-3', (g) => {
        fill(g, 26, 3, 29, 11, '.');
        fill(g, 34, 3, 41, 11, '.');
        fill(g, 30, 7, 33, 11, '.');
      });
      expect(errs(open, '2-3')).toMatch(/2-3 chain: the bot without balance still finishes: balance is not needed here/);
    });
    it('2-4: a target ring out of reach leaves its gate shut; 2-5: no keys leaves the doors shut', () => {
      expect(
        errs(
          edit('2-4', (g) => {
            fill(g, 46, 8, 47, 9, '.');
            fill(g, 46, 2, 47, 3, 'a');
          }),
          '2-4',
        ),
      ).toMatch(/2-4 chain: not solvable.*pioneer cannot reach G/);
      expect(
        errs(
          edit('2-5', (g) =>
            g.forEach((r) =>
              r.forEach((c, x) => {
                if (c === 'k') r[x] = '.';
              }),
            ),
          ),
          '2-5',
        ),
      ).toMatch(/2-5 chain: not solvable/);
    });
    it('3-3: lakes narrow enough to jump make the movers unnecessary; 3-4: walls a jump climbs make the pickaxe unnecessary and no pickaxe item is unsolvable', () => {
      expect(
        errs(
          edit('3-3', (g) => {
            fill(g, 18, 12, 24, 13, '#');
            fill(g, 60, 12, 64, 13, '#');
          }),
          '3-3',
        ),
      ).toMatch(/3-3 chain: the bot without mover still finishes: mover is not needed here/);
      expect(
        errs(
          edit('3-4', (g) => {
            fill(g, 44, 4, 50, 8, '.');
            fill(g, 82, 7, 86, 9, '.');
          }),
          '3-4',
        ),
      ).toMatch(/3-4 chain: the bot without pickaxe still finishes: pickaxe is not needed here/);
      expect(
        errs(
          edit('3-4', (g) => {
            for (const r of g) for (let x = 0; x < r.length; x++) if (r[x] === 'p') r[x] = '.';
          }),
          '3-4',
        ),
      ).toMatch(/3-4 chain: not solvable/);
    });
    it('2-6 with a hint (levels 6 and 7 have none) is red', () => {
      const hinted = tweak('2-6', (l) => {
        l.def = { ...l.def!, hints: [{ x: 4, y: 9, text: 'Cuidado con los escarabajos' }] };
      });
      expect(errs(hinted, '2-6')).toMatch(/levels 6 and 7 of a world have no hints/);
    });
    it('a hard existing level in the Playa slot is out of band (l12 as 1-1)', () => {
      const l12 = LEVELS.find((l) => l.id === 'l12')!;
      const hard = tweak('1-1', (l) => {
        l.def = { ...l12, id: '1-1', biome: 'beach', players: { min: 2, max: 2 }, tether: 'freeOnly', hints: [] };
        l.mode = 'L';
      });
      expect(learnLevel(hard, 0).errors.join('\n')).toMatch(/outside the Playa band/);
    });
    it('a level with no checkpoint on a long route is red', () => {
      const noCp = tweak('1-7', (l) => {
        l.def = { ...l.def!, rows: l.def!.rows.map((r) => r.replace(/P/g, '.')) };
      });
      expect(learnLevel(noCp, idx(noCp, '1-7')).errors.join('\n')).toMatch(/checkpoints for a/);
    });
    it('a fourth star out of reach is red', () => {
      const lost = tweak('1-1', (l) => {
        l.def = { ...l.def!, rows: l.def!.rows.map((r, y) => (y === 5 ? r.slice(0, 30) + '*' + r.slice(31) : r)) };
      });
      expect(learnLevel(lost, 0).errors.join('\n')).toMatch(/stars 3\/4/);
    });
  });
});
