// Manchazo's entry in the game registry (internal id `arena`, folder `games/arena`). Published since F5: it has sabotages and events, so apps/catalog lists it in the menu (second, after Pizzas).
import type { GameManifest, TeamStyle } from '@pichi/core/contract';

// Manchazo's two teams: orange + triangle against blue + circle (the colour-blind safe pair of the grid scene; the glyph tells them apart too).
export const TEAM_STYLES: readonly TeamStyle[] = [
  { name: 'Naranja', color: '#E69F00', icon: '▲' },
  { name: 'Azul', color: '#0072B2', icon: '●' },
];

// "Cómo se juega": the current rules (the one mode, and the manifest's own card, say the same).
const STEPS = [
  { icon: 'move', text: 'Muévete por la grilla con el stick' },
  { icon: 'star', text: 'Suelta una piñata: estalla a los 2 s y pinta el piso en rombo' },
  { icon: 'plate', text: 'Si te alcanza el estallido rival, quedas quieto 1,2 s' },
  { icon: 'bell', text: 'Gana quien pinte más piso. Recoge sabotajes y úsalos con el botón 2' },
] as const;

export const arenaManifest = {
  id: 'arena',
  name: 'Manchazo',
  blurb: 'Dos equipos sueltan piñatas que pintan el piso en rombo: gana el que deje más piso de su color.',
  minPlayers: 2,
  maxPlayers: 8,
  controls: {
    stick: { label: 'Moverse', icon: 'move' },
    btn1: { label: 'Empujar', icon: 'grab' },
    btn2: { label: 'Embestir', icon: 'jump' },
  },
  // Manchazo (F1): Arena's one mode is orange against blue. The 'game' handicap is the game's own rule: radius +1 and a reserve pinata per missing player.
  modes: [
    {
      id: 'versus',
      label: 'Naranja contra azul',
      players: [2, 8],
      teams: { count: [2, 2], maxRatio: 4, handicap: 'game', styles: TEAM_STYLES },
      controls: { btn1: { label: 'Piñata', icon: 'star' }, btn2: { label: 'Sabotaje', icon: 'bell' } },
      howTo: {
        steps: STEPS,
      },
    },
  ],
  defaultMode: 'versus',
  howTo: { steps: STEPS },
} as const satisfies GameManifest;
