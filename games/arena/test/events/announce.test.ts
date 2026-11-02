import { describe, expect, it } from 'vitest';
import { BANNER_TICKS, CLOCK_FROM_TICKS, type EventKind } from '../../sim';
import { EVENT_NAMES, bannerOf, bannerText, nextLine } from '../../screen/match/event-banner';
import { createEventAlert } from '../../screen/match/event-alert';
import { evRound, lead, only, quiet, run, untilEnd } from './ev-drive';

const name = (t: number) => (t === 0 ? 'Naranja' : 'Azul');

describe('every event is announced on the TV', () => {
  for (const kind of ['bigPinata', 'rain', 'gold', 'vacuum'] as EventKind[])
    it(`${kind}: the banner appears when it starts, with its name, and goes away after 3 s`, () => {
      const s = only(evRound(), kind, 10);
      expect(bannerOf(s, name)).toBeNull();
      run(s, 11);
      const b = bannerOf(s, name)!;
      expect(b.kind).toBe(kind);
      expect(b.title.length).toBeGreaterThan(3);
      expect(b.sub.length).toBeGreaterThan(10);
      run(s, BANNER_TICKS);
      expect(bannerOf(s, name)).toBeNull();
    });
  it('come-back, hidden scoreboard, Hourglass falling, ¡TIEMPO EXTRA! and the broken clock have their own banner', () => {
    const titles = (['comeback', 'hidden', 'clockWarn', 'overtime', 'clockBroken'] as const).map((k) => bannerText(k, 'Azul').title);
    expect(titles).toEqual(['¡REMONTADA!', 'MARCADOR OCULTO', 'RELOJ DE ARENA', '¡TIEMPO EXTRA!', 'EL RELOJ SE ROMPIÓ']);
    expect(bannerText('comeback', 'Azul').sub).toContain('Azul');
  });
  it('the real Hourglass announcement carries the team that trails', () => {
    const s = quiet(evRound());
    lead(s, 0, 80);
    untilEnd(s, CLOCK_FROM_TICKS);
    run(s, 1);
    expect(bannerOf(s, name)).toMatchObject({ kind: 'clockWarn', team: 1, title: 'RELOJ DE ARENA' });
    expect(bannerOf(s, name)!.sub).toContain('Azul');
  });
  it('the next-event line names the next one of the program and is empty while one runs or when none is left', () => {
    const s = only(evRound(), 'rain', 600);
    expect(nextLine(s)).toBe(`Próximo evento: ${EVENT_NAMES.rain} (10 s)`);
    s.grid.tick = 600;
    run(s, 1);
    expect(nextLine(s)).toBe('');
  });
  it('every announcement buzzes every phone once (colour and vibration on the phone)', () => {
    const sent: unknown[] = [];
    const alert = createEventAlert(
      (m) => void sent.push(m),
      (slot) => slot + 100,
    );
    const s = only(evRound(3, [0, 1, 0]), 'gold', 5);
    alert.sync(s);
    run(s, 10);
    alert.sync(s);
    expect(sent).toEqual([0, 1, 2].map((i) => ({ t: 'buzz', playerId: 100 + i, kind: 'alert' })));
    alert.sync(s);
    expect(sent).toHaveLength(3); // the same announcement does not buzz twice
  });
});
