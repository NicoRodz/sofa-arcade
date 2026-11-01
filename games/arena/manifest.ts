// Arena's entry in the game registry. `soon: true`: it is in development, so the composition root (apps/catalog) keeps it out of the screen's menu
// unless the page opens with `?soon=1`. The contract's GameManifest has no such field (it is extra here, read by apps/catalog), so nothing in platform/ changed.
import type { GameManifest } from '@pichi/core/contract';

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
  howTo: {
    steps: [
      { icon: 'star', text: 'Sé el último en pie sobre la plataforma' },
      { icon: 'grab', text: 'Empujar lanza a quien tengas cerca' },
      { icon: 'jump', text: 'Embestir te lanza hacia donde miras' },
      { icon: 'plate', text: 'La plataforma se encoge: no te quedes en el borde' },
    ],
  },
} as const satisfies GameManifest & { soon: boolean };
