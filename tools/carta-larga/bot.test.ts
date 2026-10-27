// The Carta larga bot (tools/carta-larga/bot.ts) plays the four maps it used to fail: a round delivers on each, and the plates that used to stay undelivered are served.
import { describe, expect, it } from 'vitest';
import { measure } from './measure';

describe('carta-larga bot', () => {
  it('Pasaplatos (26): the plates cross the wall through the H hatches and get delivered', () => {
    const r = measure('26', 2, 1, 'normal');
    expect(r.served).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThan(0);
  });
  it('La nonna (25): two chefs do not stop each other at the sauce pots', () => {
    const r = measure('25', 2, 1, 'normal');
    expect(r.served).toBeGreaterThan(4);
    expect(r.byRecipe.nonna ?? 0).toBeGreaterThan(0);
  });
  it('Isla de hornos (27): the Pizza de la casa is delivered', () => {
    expect(measure('27', 4, 1, 'normal').byRecipe.casa ?? 0).toBeGreaterThan(0);
  });
  it('Cocina espejo (28): the Bandeja is delivered', () => {
    expect(measure('28', 7, 1, 'normal').byRecipe.bandeja ?? 0).toBeGreaterThan(0);
  });
});
