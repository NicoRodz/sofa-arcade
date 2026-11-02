// Arena's entry in the game registry. `soon: true`: it is in development, so the composition root (apps/catalog) keeps it out of the screen's menu
// unless the page opens with `?soon=1`. The contract's GameManifest has no such field (it is extra here, read by apps/catalog), so nothing in platform/ changed.
import type { GameManifest, TeamStyle } from '@pichi/core/contract';

// Manchazo's two teams: orange + triangle against blue + circle (the colour-blind safe pair of the grid scene; the glyph tells them apart too).
export const TEAM_STYLES: readonly TeamStyle[] = [
  { name: 'Naranja', color: '#E69F00', icon: '▲' },
  { name: 'Azul', color: '#0072B2', icon: '●' },
];

export const arenaManifest = {
  id: 'arena',
  name: 'Arena de empujones',
  blurb: 'Empuja a tus rivales fuera de la plataforma.',
  soon: true,
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
      controls: { btn1: { label: 'Piñata', icon: 'star' }, btn2: { label: 'Pronto', icon: 'jump' } },
      howTo: {
        steps: [
          { icon: 'move', text: 'Muévete por la grilla con el stick' },
          { icon: 'star', text: 'Suelta una piñata: estalla a los 2 s y pinta en rombo' },
          { icon: 'plate', text: 'Si un estallido rival te alcanza, quedas quieto 1,2 s' },
          { icon: 'bell', text: 'Gana el equipo con más área pintada al acabar el reloj' },
        ],
      },
    },
  ],
  defaultMode: 'versus',
  howTo: {
    steps: [
      { icon: 'star', text: 'Sé el último en pie sobre la plataforma' },
      { icon: 'grab', text: 'Empujar lanza a quien tengas cerca' },
      { icon: 'jump', text: 'Embestir te lanza hacia donde miras' },
      { icon: 'plate', text: 'La plataforma se encoge: no te quedes en el borde' },
    ],
  },
} as const satisfies GameManifest & { soon: boolean };
