import { describe, expect, it } from 'vitest';
import { ManchazoRun } from '../../screen/match/run';
import { HINT_REFRESH_MS, createSabotageHints, sabotageHint } from '../../screen/match/phone-hints';
import { PLUS_SABOTAGES } from '../../sim';
import { USE, give, plus, plusRound, put, tick } from './plus-drive';

describe('button 2 on the phone with the F8a cards (hint and buzz, no protocol change)', () => {
  it('each new card names itself on B with an icon the phone already has', () => {
    for (const c of PLUS_SABOTAGES) {
      const h = sabotageHint(c.kind, null);
      expect(h.b).toBe(c.name);
      expect(h.bIcon).toBeTruthy();
      expect(h.bOff).toBeUndefined();
    }
    expect(sabotageHint('sponge', null, { squeeze: 4, dizzy: false, threat: false }).b).toBe('Exprimir 4s');
  });
  it('A says it when Mareo has you or is charging next to you, and wins over an armed pinata', () => {
    expect(sabotageHint(null, 'glue', { squeeze: 0, dizzy: true, threat: false }).a).toBe('¡Mareado! Stick al revés');
    expect(sabotageHint(null, null, { squeeze: 0, dizzy: false, threat: true }).a).toBe('¡Aléjate! Mareo');
    expect(sabotageHint(null, 'glue').a).toBe('Piñata pegote');
  });
  it('the phone buzzes when a Mareo charges next to it and again when it hits, and not for the others', () => {
    const sent: any[] = [];
    const hints = createSabotageHints(
      (m) => sent.push(m),
      (slot) => slot + 10,
    );
    const s = plusRound([0, 1, 1]);
    put(s, 0, 10, 0);
    put(s, 1, 11, 0);
    put(s, 2, 20, 14);
    hints.sync(s, 0);
    sent.length = 0;
    give(s, 0, 'dizzy');
    tick(s, { 0: USE });
    hints.sync(s, 100);
    const buzzes = () => sent.filter((m) => m.t === 'buzz').map((m) => [m.playerId, m.kind]);
    expect(buzzes().some(([id]) => id === 10)).toBe(false); // the caster is not warned of its own Mareo
    expect(buzzes()).toContainEqual([11, 'alert']); // the rival next to it: walk away
    expect(buzzes().some(([id]) => id === 12)).toBe(false);
    expect(sent.find((m) => m.t === 'hint' && m.playerId === 11).a).toBe('¡Aléjate! Mareo');
    tick(s, {}, 30);
    sent.length = 0;
    hints.sync(s, 200 + HINT_REFRESH_MS);
    expect(plus(s).dizzy[1]).toBeGreaterThan(0);
    expect(buzzes()).toContainEqual([11, 'big']);
    expect(sent.find((m) => m.t === 'hint' && m.playerId === 11).a).toBe('¡Mareado! Stick al revés');
  });
  it('the TV runs rounds with the F8a cards in the deck', () => {
    const run = new ManchazoRun([0, 1], [0, 1], 5, 1234);
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) new ManchazoRun([0, 1], [0, 1], seed, 1234).state.match.sab!.deck.forEach((k) => seen.add(k));
    expect(run.state.match.sab!.plus).not.toBeNull();
    expect(seen.has('dizzy') && seen.has('tape') && seen.has('sponge') && seen.has('swap') && seen.has('ink')).toBe(true);
  });
});
