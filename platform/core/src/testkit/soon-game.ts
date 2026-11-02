// Test fixture: a made-up game still in development (manifest `soon: true`). The platform tests that need "a game that is announced but not published" use this one,
// never a real game of games/: a real game stops being `soon` the day it is published and would take those tests with it.
import type { ComingSoon } from '../contract/catalog';
import type { GameManifest } from '../contract/game';

export const soonManifest = {
  id: 'soon-fixture',
  name: 'Juego en desarrollo',
  blurb: 'Un juego ficticio anunciado que todavía no se publica.',
  soon: true,
  minPlayers: 2,
  maxPlayers: 8,
  controls: {
    stick: { label: 'Moverse', icon: 'move' },
    btn1: { label: 'Acción', icon: 'grab' },
    btn2: { label: 'Salto', icon: 'jump' },
  },
  howTo: {
    steps: [
      { icon: 'move', text: 'Muévete con el joystick.' },
      { icon: 'grab', text: 'Usa el botón uno para actuar.' },
      { icon: 'jump', text: 'Usa el botón dos para saltar.' },
    ],
  },
} as const satisfies GameManifest & { soon: true };

/** The "Próximamente" card the menu shows for it: what `apps/catalog` derives from a manifest in development. */
export const SOON_CARD: ComingSoon = { id: soonManifest.id, name: soonManifest.name, blurb: soonManifest.blurb };
