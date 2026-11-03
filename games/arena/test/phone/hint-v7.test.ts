// F9 (protocol v7): the hint of each phone carries `st` (dizzy / stained, for as long as it holds) and `card` (the card in hand); A keeps its label so a v6 phone and the new half agree.
import { describe, expect, it } from 'vitest';
import { createSabotageHints } from '../../screen/match/phone-hints';
import { USE, give, plus, plusRound, put, tick } from '../sabotage-plus/plus-drive';
import { rround, stain, tick as rtick, give as rgive } from '../rescue/rescue-drive';

type Hint = { t: string; playerId: number; a?: string | null; st?: string; card?: string };
const hints = () => {
  const sent: Hint[] = [];
  const h = createSabotageHints(
    (m) => void sent.push(m as Hint),
    (slot) => slot + 10,
  );
  return { h, last: (id: number) => sent.filter((m) => m.t === 'hint' && m.playerId === id).at(-1)! };
};

describe('hint: st and card', () => {
  it('a stained body says `stained` (and keeps the old A text for a phone that does not know st); the card in hand rides along', () => {
    const { h, last } = hints();
    const s = rround([0, 1, 0]);
    put0(s);
    rgive(s, 0, 'glue');
    stain(s, 0); // the hand is not emptied by hand: the sim only drops it at a blast
    rtick(s);
    h.sync(s, 0);
    const m = last(10);
    expect(m.st).toBe('stained');
    expect(m.card).toBe('glue');
    expect(m.a).toContain('Manchado');
  });
  it('a body in hand with a card and no status carries `card` and no `st`; a bare body carries neither key', () => {
    const { h, last } = hints();
    const s = rround([0, 1]);
    rgive(s, 1, 'fan');
    h.sync(s, 0);
    expect(last(11)).toMatchObject({ card: 'fan' });
    expect(last(11)).not.toHaveProperty('st');
    expect(last(10)).not.toHaveProperty('st');
    expect(last(10)).not.toHaveProperty('card');
  });
  it('Mareo on a body says `dizzy`, and it stops saying it once the effect ends (the phone drops the status when the hint does)', () => {
    const { h, last } = hints();
    const s = plusRound([0, 1, 1, 1]);
    put(s, 0, 10, 0);
    put(s, 1, 12, 0);
    put(s, 2, 20, 14);
    put(s, 3, 25, 14);
    give(s, 0, 'dizzy');
    tick(s, { 0: USE });
    tick(s, {}, 30);
    expect(plus(s).dizzy[1]).toBeGreaterThan(0);
    h.sync(s, 1000);
    expect(last(11).st).toBe('dizzy');
    plus(s).dizzy[1] = 0;
    h.sync(s, 2000);
    expect(last(11)).not.toHaveProperty('st');
  });
});
function put0(s: ReturnType<typeof rround>) {
  put(s, 0, 3, 7);
  put(s, 2, 4, 7);
  put(s, 1, 20, 3);
}
