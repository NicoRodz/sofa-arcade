import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../../map';
import { ARCHETYPE_HINTS, ARCHETYPE_TICKS, archetypeBanner } from '../../screen/match/hud/archetype-banner';

describe('the archetype banner', () => {
  it('shouts the name of each map at tick 0 ("¡ISLAS!") with a hint, and the Clasico fallback too', () => {
    expect([...ARCHETYPES, 'clasico' as const].map((k) => archetypeBanner(0, k)!.title)).toEqual([
      '¡PASILLOS!',
      '¡ISLAS!',
      '¡PLAZA!',
      '¡OCHO!',
      '¡CLÁSICO!',
    ]);
    expect(archetypeBanner(0, 'islas')!.sub).toBe(ARCHETYPE_HINTS.islas);
  });

  it('lasts 90 ticks (1.5 s at 60 Hz): there at 89, gone at 90, never before the round and never on the hand-made map', () => {
    const shown = Array.from({ length: 300 }, (_, t) => t).filter((t) => archetypeBanner(t, 'plaza') !== null);
    expect(ARCHETYPE_TICKS).toBe(90);
    expect(shown).toEqual(Array.from({ length: 90 }, (_, t) => t));
    expect(archetypeBanner(-1, 'plaza')).toBeNull();
    expect(archetypeBanner(0, null)).toBeNull();
  });

  it('pops in (scale 1.4 down to 1 within 8 ticks) and fades out over the last 12 ticks, solid in between', () => {
    expect(archetypeBanner(0, 'ocho')!.scale).toBeCloseTo(1.4);
    expect(archetypeBanner(8, 'ocho')!.scale).toBeCloseTo(1);
    expect(archetypeBanner(40, 'ocho')).toMatchObject({ scale: 1, alpha: 1 });
    const fade = Array.from({ length: 12 }, (_, k) => archetypeBanner(78 + k, 'ocho')!.alpha);
    expect(fade[0]).toBe(1);
    expect(fade.every((a, k) => k === 0 || a < fade[k - 1]!)).toBe(true);
    expect(fade[11]).toBeCloseTo(1 / 12);
  });
});
