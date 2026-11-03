// F9: the words and colours of the phone's notices (games/arena/controller/alerts.ts) and the card colours it shares with the TV.
import { BUZZ_PATTERNS } from '@pichi/core';
import { describe, expect, it } from 'vitest';
import { ALERTS, ALERT_KINDS, FOLD_MS, alertFor, isAlertKind } from '../../controller/alerts';
import { CARD_HEX, STATUS_TEXT } from '../../controller/phone-state';
import { CARD_HEX as TV_CARD_HEX } from '../../screen/art/glyphs';

describe('alerts: the words of each notice', () => {
  it('each kind says what happened and what to do, in these words', () => {
    expect(Object.fromEntries(ALERT_KINDS.map((k) => [k, [ALERTS[k].title, ALERTS[k].line]]))).toEqual({
      stain: ['¡TE MANCHARON!', 'Quieto hasta que un compañero te rescate'],
      rescued: ['¡TE RESCATARON!', 'Libre: a pintar'],
      lootlost: ['¡PERDISTE EL BOTÍN!', 'Tu sabotaje cayó al piso'],
      dizzy: ['¡MAREADO!', 'Stick al revés'],
      phase: ['¡CAMBIO DE FASE!', 'Mira la tele'],
      hourglass: ['¡RELOJ DE ARENA!', 'En disputa: ve al círculo'],
    });
    expect(STATUS_TEXT).toEqual({ dizzy: '¡MAREADO!', stained: '¡MANCHADO!' });
  });
  it('every kind is a platform buzz kind with a tone, a colour pair and a duration; isAlertKind knows exactly those', () => {
    for (const k of ALERT_KINDS) {
      expect(Object.hasOwn(BUZZ_PATTERNS, k)).toBe(true);
      expect(ALERTS[k].tone.length).toBeGreaterThan(0);
      expect(ALERTS[k].bg).toMatch(/^#[0-9A-F]{6}$/);
      expect(ALERTS[k].fg).toMatch(/^#[0-9A-F]{6}$/);
      expect(ALERTS[k].ms).toBeGreaterThan(1000);
      expect(isAlertKind(k)).toBe(true);
    }
    for (const k of ['alert', 'big', 'slip', 'nope', 'toString']) expect(isAlertKind(k)).toBe(false); // `alert` and `big` stay the platform's own note
  });
  it('a lootlost right after a stain folds into ONE notice (the stain one, with the card line); later it stands alone', () => {
    const folded = alertFor('lootlost', { kind: 'stain', at: 1000 }, 1000 + FOLD_MS - 1);
    expect(folded.title).toBe('¡TE MANCHARON!');
    expect(folded.line).toBe('Y soltaste tu sabotaje: cayó al piso');
    expect(folded.ms).toBeGreaterThan(ALERTS.stain.ms);
    expect(folded.tone.length).toBe(ALERTS.stain.tone.length + 1);
    expect(alertFor('lootlost', { kind: 'stain', at: 1000 }, 1000 + FOLD_MS)).toBe(ALERTS.lootlost);
    expect(alertFor('lootlost', null, 0)).toBe(ALERTS.lootlost);
    expect(alertFor('lootlost', { kind: 'rescued', at: 1000 }, 1001)).toBe(ALERTS.lootlost);
    expect(alertFor('stain', { kind: 'stain', at: 1000 }, 1001)).toBe(ALERTS.stain);
  });
});

describe('the card colours of the phone are the TV\'s', () => {
  it('CARD_HEX of the phone equals CARD_HEX of screen/art/glyphs, key by key', () => {
    expect(CARD_HEX).toEqual({ ...TV_CARD_HEX });
    expect(Object.keys(CARD_HEX).length).toBe(10);
  });
});
