// QA versus 31-oct M4: 8 players moved to 5 contra 3 greyed every map in the lobby, yet the round started on a fallback map.
import { describe, expect, it } from 'vitest';
import { GAMES, modeOf } from '@pichi/catalog';
import { versusLobbyMaps } from './lobby';
import { noMapFits, versusStartProblem } from './start-fit';

const versus = modeOf(GAMES.find((g) => g.id === 'pizzas')!, 'versus');
const t = (...sz: number[]) => {
  let n = 0;
  return sz.map((s, id) => ({ id, name: `T${id}`, color: '#000', icon: 'x', playerIds: Array.from({ length: s }, () => ++n) }));
};

describe('a split with no map does not start', () => {
  it('5 contra 3: the lobby greys all six maps and the start says why and what to do', () => {
    expect(versusLobbyMaps([5, 3]).filter((x) => x.status.state === 'recommended')).toHaveLength(0); // what the lobby shows
    expect(noMapFits([5, 3])).toBe('5 contra 3: ningún mapa tiene lugar para tantos en una cocina. Pasen a 4 contra 4');
    expect(versusStartProblem(versus, t(5, 3))).toBe(noMapFits([5, 3]));
  });
  it('splits that have a map start as before: 4 v 4, 4 v 3, 3 v 2, 2 v 1', () => {
    for (const sz of [
      [4, 4],
      [4, 3],
      [3, 2],
      [2, 1],
    ])
      expect(versusStartProblem(versus, t(...sz)), sz.join('v')).toBe('');
  });
  it('an illegal split keeps its own text first', () => {
    expect(versusStartProblem(versus, t(5, 1))).toMatch(/desiguales/);
    expect(versusStartProblem(versus, null)).toBe('Faltan los equipos');
  });
});
