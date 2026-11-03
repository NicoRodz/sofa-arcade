// The top feed: what each team took or used and what it does. Legends for the 10 cards, who wins the row, how long an entry lives, and the feed's "tomó" read off the sim's hands.
import { describe, expect, it } from 'vitest';
import { ALL_KINDS, SHOT_KINDS, TAPE_LEN } from '../../sim';
import { Feed, type FeedEvent, type GrabEvent } from '../../screen/match/hud/feed';
import { LEGENDS } from '../../screen/match/hud/legends';
import { ENTRY_TICKS, NAME_MAX, entryMotion, topFeed } from '../../screen/match/hud/top-feed';
import { HUD } from '../../screen/match/layout';
import { USE, give, tick as step } from '../sabotage/sab-drive';
import { plusRound } from '../sabotage-plus/plus-drive';

const NAMES = ['Nico', 'Ana', 'Beto', 'Caro', 'Dani', 'Eli', 'Fer', 'Gabrielito Martinez'];
const name = (slot: number) => NAMES[slot]!;
const grab = (tick: number, team: number, slot: number, kind: GrabEvent['kind']): GrabEvent => ({ tick, body: slot, slot, team, kind });
const fired = (tick: number, team: number, slot: number, kind: GrabEvent['kind']): FeedEvent => ({
  type: 'fired',
  tick,
  body: slot,
  slot,
  team,
  kind,
});
const words = (t: string) => t.trim().split(/\s+/).length;

describe('the legend of every card', () => {
  it('each of the 10 cards has an article + name and a legend of 4 to 7 words', () => {
    expect(Object.keys(LEGENDS).sort()).toEqual([...ALL_KINDS].sort());
    for (const k of ALL_KINDS) {
      expect(LEGENDS[k].item).toMatch(/^(el|la|las|los) \p{L}/u);
      expect(words(LEGENDS[k].legend)).toBeGreaterThanOrEqual(4);
      expect(words(LEGENDS[k].legend)).toBeLessThanOrEqual(7);
    }
  });
});

describe('the legends tell what the cards do today (after PR4 projectiles and PR6 Cinta/Esponja v2)', () => {
  const legend = (k: (typeof ALL_KINDS)[number]) => LEGENDS[k].legend;

  it('the cards that fly say they are shot and hit ONE rival: no "cercano" any more', () => {
    for (const k of SHOT_KINDS) {
      expect(legend(k)).toMatch(/^disparas/);
      expect(legend(k)).toMatch(/golpeado/);
      expect(legend(k)).not.toMatch(/cercan/);
    }
    expect([...SHOT_KINDS].sort()).toEqual(['dizzy', 'glue', 'swap']);
  });

  it('the Cinta is a barrier of TAPE_LEN tiles that cuts blasts (not "un cuadro"); the Esponja soaks and then squeezes', () => {
    expect(legend('tape')).toContain(`${TAPE_LEN} casillas`);
    expect(legend('tape')).toMatch(/explosiones/);
    expect(legend('tape')).not.toMatch(/cuadro/);
    expect(legend('sponge')).toMatch(/absorbes.*exprimes/);
  });
});

describe('top feed: what each team shows', () => {
  it('"Nico tomó el Ventilador" for a take and "Nico usó el Ventilador" for a play, with the legend', () => {
    const took = topFeed({ log: [], grabs: [grab(100, 0, 0, 'fan')] }, 110, name)[0]!;
    expect(took).toMatchObject({
      team: 0,
      slot: 0,
      kind: 'fan',
      verb: 'tomó',
      age: 10,
      who: 'Nico tomó el Ventilador',
      legend: LEGENDS.fan.legend,
    });
    const used = topFeed({ log: [fired(100, 1, 1, 'tape')], grabs: [] }, 100, name)[1]!;
    expect(used).toMatchObject({ team: 1, verb: 'usó', who: 'Ana usó la Cinta', legend: LEGENDS.tape.legend });
    expect(topFeed({ log: [], grabs: [grab(100, 0, 0, 'fan')] }, 110, name)[1]).toBeNull(); // the other team's row stays empty
  });

  it('an entry lives exactly ENTRY_TICKS (4 s)', () => {
    const feed = { log: [], grabs: [grab(100, 0, 0, 'fan')] };
    expect(ENTRY_TICKS).toBe(240);
    expect(topFeed(feed, 100 + ENTRY_TICKS - 1, name)[0]).not.toBeNull();
    expect(topFeed(feed, 100 + ENTRY_TICKS, name)[0]).toBeNull();
    expect(topFeed(feed, 99, name)[0]).toBeNull();
  });

  it('the newest of a team wins the row: taking then playing shows the play; a later take of another card replaces it', () => {
    const feed = { log: [fired(150, 0, 0, 'fan')], grabs: [grab(100, 0, 0, 'fan'), grab(200, 0, 2, 'dizzy')] };
    expect(topFeed(feed, 160, name)[0]).toMatchObject({ verb: 'usó', kind: 'fan' });
    expect(topFeed(feed, 210, name)[0]).toMatchObject({ verb: 'tomó', kind: 'dizzy', slot: 2 });
    expect(topFeed({ log: [fired(100, 0, 0, 'fan')], grabs: [grab(100, 0, 0, 'fan')] }, 100, name)[0]!.verb).toBe('usó'); // same tick: the play
  });

  it('a long name is cut so the line fits its row', () => {
    const e = topFeed({ log: [], grabs: [grab(0, 1, 7, 'ink')] }, 0, name)[1]!;
    expect(e.who).toBe(`Gabrielit… tomó la Tinta invisible`);
    expect(e.who.split(' tomó')[0]!.length).toBe(NAME_MAX);
  });

  it('it slides in, stays put and fades over the last ticks', () => {
    expect(entryMotion(0).slide).toBeLessThan(-20);
    expect(entryMotion(60)).toEqual({ slide: -0, alpha: 1 });
    expect(entryMotion(ENTRY_TICKS - 10).alpha).toBeCloseTo(0.5);
    expect(entryMotion(ENTRY_TICKS).alpha).toBe(0);
  });

  it('the two rows sit in the top band, side by side with the percentages, never over the floor', () => {
    expect(HUD.feed0!.y + HUD.feed0!.h).toBe(HUD.feed1!.y);
    expect(HUD.feed0!.x).toBeGreaterThanOrEqual(HUD.pct0!.x + HUD.pct0!.w);
    expect(HUD.feed0!.x + HUD.feed0!.w).toBeLessThanOrEqual(HUD.clock!.x);
  });
});

describe('the feed reads a "tomó" off the hands', () => {
  it('a hand that fills up logs a grab; playing the card does not; the log keeps no grab', () => {
    const s = plusRound([0, 1]);
    const f = new Feed();
    for (let k = 0; k < 3; k++) step(s, {}), f.observe(s);
    give(s, 1, 'roller');
    step(s, {});
    f.observe(s);
    expect(f.grabs).toEqual([{ tick: s.grid.tick, body: 1, slot: 1, team: 1, kind: 'roller' }]);
    expect(f.log).toEqual([]); // taking is not in the log: its hash and its cues are as before
    step(s, { 1: USE });
    f.observe(s);
    expect(f.grabs).toHaveLength(1);
    expect(f.log.map((e) => e.type)).toEqual(['fired']); // the log only knows the play
  });

  it('a card already in hand at the first observation was not "taken just now"', () => {
    const s = plusRound([0, 1]);
    give(s, 0, 'fan');
    const f = new Feed();
    f.observe(s);
    expect(f.grabs).toEqual([]);
  });
});
