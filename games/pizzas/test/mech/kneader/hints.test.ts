// What the phone says at M and Q (design: "Falta otro chef", the fire bar for whoever blows) and what it says at a board with the raw ball.
import { describe, expect, it } from 'vitest';
import { KNEADER_ROWS } from './map';
import { WOOD_ROWS } from '../woodOven/map';
import { press, put, rig, run, station } from './rig';
import { chefHint } from '../../../sim/phone/hints';
import type { Controls } from '../../../sim/overcooked';

const hold = (...ids: number[]) => new Map<number, Controls>(ids.map((id) => [id, press(true, 0, id === 1 ? 1 : -1, 0)]));

describe('kneader hints', () => {
  const setup = () => {
    const g = rig(KNEADER_ROWS, 'kneader');
    put(g, 1, 6, 4, 1, 0, 'raw0');
    put(g, 2, 8, 4, -1, 0);
    return g;
  };
  it('the ball in hand: A puts it on M; empty M: nothing to do for a chef without dough', () => {
    const g = setup();
    expect(chefHint(g, g.players.get(1)!)).toMatchObject({ a: 'Poner masa' });
    expect(chefHint(g, g.players.get(2)!)).toMatchObject({ a: 'Trae masa', aOff: true });
  });
  it('a board says to knead first when the chef holds the raw ball', () => {
    const g = rig(KNEADER_ROWS, 'kneader');
    put(g, 1, 4, 1, -1, 0, 'raw0');
    expect(chefHint(g, g.players.get(1)!)).toMatchObject({ a: 'Amasa primero', aOff: true });
  });
  it('while kneading: a chef off the handles is told to go, a lone one "Falta otro chef", a pair "Amasar"', () => {
    const g = setup();
    g.players.get(1)!.item = null;
    station(g, 'kneader').item = 'raw0';
    put(g, 2, 8, 3, 0, 1); // beside the handle, not on it: M is below... it faces nothing
    put(g, 2, 8, 4, -1, 0);
    run(g, 2, hold(1));
    expect(chefHint(g, g.players.get(1)!)).toMatchObject({ a: 'Amasando', aOff: true, b: 'Falta otro chef' });
    run(g, 2, hold(1, 2));
    expect(chefHint(g, g.players.get(1)!).b).toBe('Amasar');
    expect(chefHint(g, g.players.get(2)!).b).toBe('Amasar');
  });
  it('the dough done: A takes it', () => {
    const g = setup();
    g.players.get(1)!.item = null;
    station(g, 'kneader').item = 'cut0';
    expect(chefHint(g, g.players.get(1)!)).toMatchObject({ a: 'Tomar masa', aIcon: 'dough' });
  });
});

describe('bellows hints', () => {
  it('B names the fire of the oven it feeds, as a percentage', () => {
    const g = rig(WOOD_ROWS, 'woodOven');
    put(g, 1, 2, 7, -1, 0);
    expect(chefHint(g, g.players.get(1)!)).toMatchObject({ a: 'Fuelle', b: 'Soplar 0%' });
    run(g, 150, new Map([[1, press(true, 0, -1, 0)]]));
    expect(chefHint(g, g.players.get(1)!).b).toBe('Soplar 33%'); // 299 / 900
    run(g, 400, new Map([[1, press(true, 0, -1, 0)]]));
    expect(chefHint(g, g.players.get(1)!).b).toBe('Fuego lleno');
  });
});
