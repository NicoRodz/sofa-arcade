import { describe, expect, it } from 'vitest';
import { cardOf } from '../../sim';
import { IDLE, USE, give, put, round, sab, stick, tick } from './sab-drive';

describe('collecting and using', () => {
  it('walking onto a pickup takes its card; it comes back 12 s later with the next card', () => {
    const s = round();
    const p = sab(s).pickups[0]!;
    const first = cardOf(sab(s), p);
    put(s, 0, p.x - 1, p.y);
    tick(s, { 0: stick(1000, 0) }, 8);
    expect(sab(s).held[0]).toBe(first);
    expect(p.wait).toBeGreaterThan(0);
    tick(s, {}, 720);
    expect(p.wait).toBe(0);
    expect(cardOf(sab(s), p)).toBe(sab(s).deck[(p.pair + 1) % sab(s).deck.length]);
  });
  it('a full hand does not take another card (the pickup stays)', () => {
    const s = round();
    const p = sab(s).pickups[0]!;
    give(s, 0, 'fan');
    put(s, 0, p.x, p.y);
    tick(s, { 0: IDLE }, 3);
    expect(sab(s).held[0]).toBe('fan');
    expect(p.wait).toBe(0);
  });
  it('button 2 with an empty hand, or while stained, does nothing; the card is spent when played', () => {
    const s = round();
    tick(s, { 0: USE });
    expect(sab(s).used).toBe(0);
    give(s, 0, 'roller');
    s.match.bodies[0]!.stun = 30;
    tick(s, { 0: USE });
    expect(sab(s).held[0]).toBe('roller');
    s.match.bodies[0]!.stun = 0;
    tick(s, { 0: USE });
    expect(sab(s).held[0]).toBeNull();
    expect(sab(s).used).toBe(1);
  });
  it('a card already armed (pinata mark) blocks the next one: it is kept in hand', () => {
    const s = round();
    give(s, 0, 'glue');
    tick(s, { 0: USE });
    expect(sab(s).armed[0]).toBe('glue');
    give(s, 0, 'fan');
    tick(s, { 0: USE });
    expect(sab(s).held[0]).toBe('fan');
  });
});
