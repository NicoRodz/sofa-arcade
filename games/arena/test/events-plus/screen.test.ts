import { describe, expect, it } from 'vitest';
import { ALL_EVENT_KINDS } from '../../sim';
import { createEventAlert } from '../../screen/match/event-alert';
import { EVENT_NAMES, bannerOf, bannerText, nextLine } from '../../screen/match/event-banner';
import { eventHint } from '../../screen/match/phone-hints';
import { onlyPlus, plusRound, run } from './plus-drive';

describe('F8b: what the TV and the phones say', () => {
  it('every kind has a name and an announcement with a title and a rule', () => {
    for (const k of ALL_EVENT_KINDS) {
      expect(EVENT_NAMES[k]).toBeTruthy();
      const b = bannerText(k, 'Naranjas');
      expect(b.title.length).toBeGreaterThan(3);
      expect(b.sub.length).toBeGreaterThan(10);
    }
  });
  it('the banner shows the event when it starts and the bottom band announces the next one', () => {
    const s = onlyPlus(plusRound(), 'balloons', 300);
    expect(nextLine(s)).toContain('Globos en disputa');
    run(s, 301);
    expect(bannerOf(s, (t) => `eq${t}`)?.title).toBe('GLOBOS EN DISPUTA');
  });
  it('each phone gets the event on button A while it lasts, and nothing when no event or without the flag', () => {
    const s = onlyPlus(plusRound(), 'happyHour', 5);
    expect(eventHint(s)).toBeNull();
    run(s, 6);
    expect(eventHint(s)?.a).toContain('Hora feliz');
    run(s, 600);
    expect(eventHint(s)).toBeNull();
    const plain = onlyPlus(plusRound(), 'happyHour', 5);
    delete plain.match.ev!.plus;
    run(plain, 6);
    expect(eventHint(plain)).toBeNull();
  });
  it('every phone buzzes on the announcement (alert) and again when the effect lands (big)', () => {
    const sent: { playerId: number; kind: string }[] = [];
    const alert = createEventAlert(
      (m) => sent.push({ playerId: m.playerId, kind: m.kind }),
      (slot) => slot + 10,
    );
    const s = onlyPlus(plusRound(3, [0, 1]), 'balloons', 5);
    alert.sync(s);
    run(s, 6);
    alert.sync(s);
    expect(sent).toEqual([
      { playerId: 10, kind: 'alert' },
      { playerId: 11, kind: 'alert' },
    ]);
    run(s, 200);
    alert.sync(s);
    expect(sent.slice(2)).toEqual([
      { playerId: 10, kind: 'big' },
      { playerId: 11, kind: 'big' },
    ]);
  });
});
