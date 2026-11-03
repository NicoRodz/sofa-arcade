// Protocol v7 (Manchazo's phone, F9): the new buzz kinds and the two optional fields of `hint` (`st`, `card`). Everything is additive: a hint without them parses as it did
// in v6, and what a newer screen could add that this build does not know is dropped without losing the labels.
import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '@pichi/catalog';
import { BUZZ_PATTERNS, CARD_RE, HINT_STATUSES, PROTOCOL_VERSION, hintExtras, isBuzzKind } from './index';

const hint = (extra: object) => JSON.stringify({ t: 'hint', playerId: 3, a: '¡Mareado!', b: 'Turpentina', ...extra });

describe('protocol v7', () => {
  it('is the version that carries the phone alerts', () => {
    expect(PROTOCOL_VERSION).toBe(7);
    expect(HINT_STATUSES).toEqual(['dizzy', 'stained']);
  });
  it('knows the six alert buzzes, each with a pattern that ends in a long pulse a phone can feel', () => {
    for (const k of ['stain', 'rescued', 'lootlost', 'dizzy', 'phase', 'hourglass'] as const) {
      expect(isBuzzKind(k)).toBe(true);
      expect(BUZZ_PATTERNS[k].length % 2).toBe(1); // on / off / on...: it never ends on a pause
      expect(parseClientMessage(JSON.stringify({ t: 'buzz', playerId: 3, kind: k }))).toEqual({ t: 'buzz', playerId: 3, kind: k });
    }
    expect(parseClientMessage('{"t":"buzz","playerId":3,"kind":"nope"}')).toBeNull();
  });
  it('a hint carries the status and the card in hand', () => {
    expect(parseClientMessage(hint({ st: 'dizzy', card: 'turpentine' }))).toEqual({
      t: 'hint',
      playerId: 3,
      a: '¡Mareado!',
      b: 'Turpentina',
      st: 'dizzy',
      card: 'turpentine',
    });
    expect(hintExtras({ a: null, b: null, st: 'stained', card: 'fan' })).toEqual({ st: 'stained', card: 'fan' });
  });
  it('a v6 hint (no st, no card) parses exactly as before, with neither key', () => {
    const m = parseClientMessage(hint({}));
    expect(m).toEqual({ t: 'hint', playerId: 3, a: '¡Mareado!', b: 'Turpentina' });
    expect(m).not.toHaveProperty('st');
    expect(m).not.toHaveProperty('card');
  });
  it('an unknown status or a malformed card is dropped, the labels still go through', () => {
    for (const extra of [{ st: 'frozen' }, { st: 7 }, { card: 'Not A Card' }, { card: '' }, { card: 'x'.repeat(17) }, { card: 3 }]) {
      const m = parseClientMessage(hint(extra));
      expect(m).toEqual({ t: 'hint', playerId: 3, a: '¡Mareado!', b: 'Turpentina' });
    }
    expect(CARD_RE.test('glue')).toBe(true);
  });
});
