// Pizzas' entry in the game registry: what the menu, the lobby and the phones need to know about it (the contract's GameManifest, EXPERIMENTAL).
// Moved from platform/core/src/games.ts (F4a): the content is the same, only its home changed; core/games.ts lists it in GAMES.
import { COOP_TEAMS, type GameManifest, type TeamStyle } from '@pichi/core/contract';
import { SABOTAGE_BLURB, SABOTAGE_LABEL, SABOTAGE_MODES, SABOTAGE_OPTION } from './sim/rules/sabotage-config';

export const VERSUS_STYLES: readonly TeamStyle[] = [
  // chili red-orange + triangle against navy + circle: apart for colour-blind players too. Both are darker than every chef colour (palette in
  // protocol.ts COLORS): the first draft (#F26A1B, #1E6BD6) sat at a perceptual distance of 7 and 9 from the orange and blue chefs, these at 22 and 31.
  { name: 'Picantes', color: '#A8330A', icon: '▲' },
  { name: 'Frescos', color: '#14338A', icon: '●' },
];

export const pizzasManifest = {
  id: 'pizzas',
  name: '¡Que salgan las pizzas!',
  blurb: 'Estira la masa, corta, hornea y entrega antes de que se acabe la paciencia.',
  minPlayers: 2,
  maxPlayers: 8,
  controls: {
    stick: { label: 'Mover', icon: 'move' },
    btn1: { label: 'Tomar / Soltar', icon: 'grab' },
    btn2: { label: 'Picar / Correr', icon: 'chop' }, // held to chop; a tap with empty hands and no station in front dashes (R2). No "hold" hint: it would not fit under the longer label
  },
  howTo: {
    steps: [
      { icon: 'crate', text: 'Toma masa y tomate de las cajas' },
      { icon: 'chop', text: 'Pícalos en la tabla manteniendo el botón' },
      { icon: 'oven', text: 'Llévalos al horno y sácala a tiempo: si se pasa, se quema' },
      { icon: 'bell', text: 'Entrega la pizza en el mostrador antes de que venza el pedido' },
    ],
    note: 'Todos cooperan por el puntaje de equipo',
  },
  modes: [
    { id: 'coop', label: 'Cooperativo', players: [2, 8], teams: COOP_TEAMS },
    {
      id: 'versus',
      label: 'Duelo de cocinas',
      players: [2, 8], // the lobby only offers it from 4 (even) or an odd count with a valid handicap: see versusAvailability
      teams: { count: [2, 2], maxRatio: 2, handicap: 'score-k', styles: VERSUS_STYLES },
      howTo: {
        steps: [
          { icon: 'crate', text: 'Cada equipo tiene su cocina, con los mismos pedidos' },
          { icon: 'chop', text: 'Prepara las pizzas más rápido que el otro equipo' },
          { icon: 'oven', text: 'El pedido dorado es para el primero que lo entregue' },
          { icon: 'bell', text: 'Gana el equipo con más puntos al acabar el tiempo' },
        ],
        note: 'Con sabotaje: junta basura en el cubo, lánzala desde la catapulta y limpia la que te caiga. Si los equipos son desiguales, el chico gana un multiplicador',
      },
      options: [
        { id: 'hiddenScore', label: 'Marcador oculto al final', default: true },
        { id: 'handicap', label: 'Ventaja para el equipo chico', default: true },
      ],
      choices: [
        {
          id: SABOTAGE_OPTION,
          label: 'Sabotaje',
          values: SABOTAGE_MODES.map((m) => ({ id: m, label: SABOTAGE_LABEL[m], blurb: SABOTAGE_BLURB[m] })),
          default: 'soft',
        },
      ],
    },
  ],
  defaultMode: 'coop',
} as const satisfies GameManifest;
