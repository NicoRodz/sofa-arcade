// Obstaculos' entry in the game registry (the contract's GameManifest, EXPERIMENTAL). Moved from platform/core/src/games.ts (F4a): same content.
import type { GameManifest } from '@pichi/core/contract';

export const obstaculosManifest = {
  id: 'obstaculos',
  name: 'Obstáculos en cadena',
  blurb: 'Una cuadrilla de exploradores cruza cinco paisajes: salten, suban sobre sus compañeros y lleguen TODOS a la meta.',
  minPlayers: 2,
  maxPlayers: 8,
  controls: {
    stick: { label: 'Moverse', icon: 'move' },
    btn1: { label: 'Saltar', icon: 'jump' },
    btn2: { label: 'Agarrar', icon: 'grab' },
  },
  howTo: {
    steps: [
      { icon: 'star', text: 'Lleguen TODOS a la meta' },
      { icon: 'jump', text: 'Súbete sobre un compañero para llegar más alto' },
      { icon: 'grab', text: 'B agarra; con un compañero, B otra vez lo lanza. Sin nada, te planta' },
      { icon: 'plate', text: 'Si te quedas fuera de cámara, vuelves en burbuja' },
    ],
    note: 'Todos cooperan por el equipo',
  },
} as const satisfies GameManifest;
