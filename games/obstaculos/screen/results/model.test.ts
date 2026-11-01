import { describe, expect, it } from 'vitest';
import { awardCards, clock, levelCard } from './model';

const level = {
  id: 'l1',
  name: 'Primeros pasos',
  biome: 'beach',
  index: 0,
  cleared: true,
  retry: false,
  timeSec: 63,
  parSec: 75,
  medal: 'gold' as const,
  stars: 1,
  starsMax: 3,
  deaths: 0,
  livesLeft: 12,
  checkpoints: 0,
  checkpointsMax: 1,
  score: 2910,
};

describe('Obstaculos results view model', () => {
  it('clock is m:ss', () => {
    expect(clock(63)).toBe('1:03');
    expect(clock(4.9)).toBe('0:04');
  });
  it('a cleared level: medal, strings of every row and the sign of the points', () => {
    expect(levelCard(level as never, '#fc0')).toEqual({
      lost: false,
      medalCls: 'gold',
      medalGlyph: 'O',
      name: 'Primeros pasos',
      biomeColor: '#fc0',
      sub: 'Nivel 1',
      time: '1:03 / par 1:15',
      stars: '1/3 ★',
      lives: '12 · caídas 0',
      checkpoints: '0/1',
      pts: '+2910',
    });
  });
  it('a lost retry: no medal, infinite lives as ∞, no plus sign', () => {
    const c = levelCard({ ...level, cleared: false, retry: true, medal: null, livesLeft: Infinity, index: 2, score: -50 } as never, '#000');
    expect(c).toMatchObject({
      lost: true,
      medalCls: 'none',
      medalGlyph: '✕',
      sub: 'Nivel 3 · reintento ×0,5 · sin vidas',
      lives: '∞ · caídas 0',
      pts: '-50',
    });
  });
  it('awards: only the ones somebody won, in the fixed order, with the player name', () => {
    const cards = awardCards({ ancla: null, taxi: 2, coleccionista: 0, kamikaze: null, pegamento: 1 }, (s) => `J${s}`);
    expect(cards.map((c) => [c.label, c.slot, c.name])).toEqual([
      ['Taxi', 2, 'J2'],
      ['Coleccionista', 0, 'J0'],
      ['Pegamento', 1, 'J1'],
    ]);
    expect(cards[0]!.why).toBe('lanzamientos y manos');
  });
});
