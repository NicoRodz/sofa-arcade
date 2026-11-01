// What the Obstaculos lobby's rows show (the mode pills and the level cards) as plain data; rows-view.ts draws it. Pure functions of the lobby's state, tested
// without a DOM. The selected card and pill are fields here, so the next render draws them again from the same inputs.
import { LEVELS, MODE_BLURB, MODE_LABEL, RANDOM_LEVEL, levelCompat } from '../../index';
import type { GameMode } from '../../types';

export interface ModePill {
  id: GameMode;
  label: string;
  title: string;
  selected: boolean;
}
export const modePills = (tether: GameMode): ModePill[] =>
  (['chain', 'free'] as GameMode[]).map((m) => ({ id: m, label: MODE_LABEL[m], title: MODE_BLURB[m], selected: m === tether }));

export interface LevelCard {
  level: number; // data-level: 1..N, or RANDOM_LEVEL (0) for "Aleatorio"
  random: boolean;
  name: string;
  ok: boolean; // can be picked with this group and mode
  selected: boolean;
  range: string; // "2-4"
  stars: string;
  biome: string; // color of the biome dot ('' none)
  why: string; // the reason it cannot be picked ('' when it can)
}

export function levelCards(
  n: number,
  tether: GameMode,
  selected: number,
  biomeColor: (biome: (typeof LEVELS)[number]['biome']) => string,
): LevelCard[] {
  const cards = LEVELS.map((l, i): LevelCard => {
    const c = levelCompat(l, n, tether);
    return {
      level: i + 1,
      random: false,
      name: l.name,
      ok: c.ok,
      selected: selected === i + 1,
      range: `${l.players.min}-${l.players.max}`,
      stars: '★'.repeat(l.stars),
      biome: biomeColor(l.biome),
      why: c.ok ? '' : c.reason,
    };
  });
  return [
    ...cards,
    {
      level: RANDOM_LEVEL,
      random: true,
      name: 'Aleatorio',
      ok: true,
      selected: selected === RANDOM_LEVEL,
      range: '',
      stars: '',
      biome: '',
      why: '',
    },
  ];
}
