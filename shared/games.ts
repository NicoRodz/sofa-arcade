// Game registry: the lobby lists these and the choice travels to the phones as an id.
// Each game also declares its controls (what the stick and the two buttons are called) and its quick "how to play" steps:
// the relay sends both to the phones with the lobby config, so a new game needs no change in the controller.
import { isIconId, type IconId } from './icons';

export const PLATFORM = 'Pichiclub';

export interface ControlLabel { label: string; icon: IconId; hold?: boolean } // hold: the button is meant to be kept pressed
export interface GameControls { stick: ControlLabel; btn1: ControlLabel; btn2: ControlLabel } // btn1 = bit 0 / presses[0], btn2 = bit 1 / presses[1]
export interface HowToStep { icon: IconId; text: string }
export interface HowTo { steps: readonly HowToStep[]; note?: string }
export interface GameInfo { controls: GameControls; howTo: HowTo }
export interface GameDef extends GameInfo { id: string; name: string; blurb: string; players: string }

export const GAMES = [
  {
    id: 'pizzas', name: '¡Que salgan las pizzas!', blurb: 'Estira la masa, corta, hornea y entrega antes de que se acabe la paciencia.', players: '2 a 8 jugadores',
    controls: {
      stick: { label: 'Mover', icon: 'move' },
      btn1: { label: 'Tomar / Soltar', icon: 'grab' },
      btn2: { label: 'Picar', icon: 'chop', hold: true },
    },
    howTo: {
      steps: [
        { icon: 'crate', text: 'Toma masa y tomate de las cajas' },
        { icon: 'chop', text: 'Pícalos en la tabla manteniendo el botón' },
        { icon: 'oven', text: 'Llévalos al horno y espera' },
        { icon: 'bell', text: 'Entrega la pizza en el mostrador antes de que venza el pedido' },
      ],
      note: 'Todos cooperan por el puntaje de equipo',
    },
  },
] as const satisfies readonly GameDef[];

// Games that exist and are accepted everywhere (config, phones) but the lobby does not list yet.
// Moving an entry from HIDDEN_GAMES to GAMES is what publishes it (obstaculos: F3).
export const HIDDEN_GAMES = [
  {
    id: 'obstaculos', name: 'Obstáculos en cadena', blurb: 'Una cuadrilla de exploradores cruza cinco paisajes: salten, suban sobre sus compañeros y lleguen TODOS a la meta.', players: '2 a 8 jugadores',
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
  },
] as const satisfies readonly GameDef[];

export const ALL_GAMES: readonly GameDef[] = [...GAMES, ...HIDDEN_GAMES];
export type GameId = ((typeof GAMES)[number] | (typeof HIDDEN_GAMES)[number])['id'];
export const GAME_IDS: readonly GameId[] = GAMES.map((g) => g.id); // the listed ones
export const ALL_GAME_IDS: readonly GameId[] = ALL_GAMES.map((g) => g.id as GameId);
export const DEFAULT_GAME: GameId = GAMES[0].id;
export const isGameId = (v: unknown): v is GameId => ALL_GAME_IDS.includes(v as GameId);
export const gameName = (id: GameId): string => ALL_GAMES.find((g) => g.id === id)?.name ?? id;
export const gameInfo = (id: string, games: readonly GameDef[] = ALL_GAMES): GameInfo => {
  const g: GameDef = games.find((x) => x.id === id) ?? games[0]!;
  return { controls: g.controls, howTo: g.howTo };
};

export const LABEL_MAX = 14;
export const HOWTO_MIN_STEPS = 3;
export const HOWTO_MAX_STEPS = 4;
export const STEP_MAX = 70;

// Authoring check for a registry entry: what a phone can show legibly. Empty list = fine.
export function gameProblems(g: GameDef): string[] {
  const out: string[] = [];
  const label = (name: string, c: ControlLabel) => {
    if (!c.label.trim()) out.push(`${name}: empty label`);
    if (c.label.length > LABEL_MAX) out.push(`${name}: label over ${LABEL_MAX} chars`);
    if (!isIconId(c.icon)) out.push(`${name}: unknown icon ${String(c.icon)}`);
  };
  label('stick', g.controls.stick); label('btn1', g.controls.btn1); label('btn2', g.controls.btn2);
  const n = g.howTo.steps.length;
  if (n < HOWTO_MIN_STEPS || n > HOWTO_MAX_STEPS) out.push(`howTo: ${n} steps, want ${HOWTO_MIN_STEPS}-${HOWTO_MAX_STEPS}`);
  g.howTo.steps.forEach((s, i) => {
    if (!s.text.trim()) out.push(`step ${i + 1}: empty text`);
    if (s.text.length > STEP_MAX) out.push(`step ${i + 1}: text over ${STEP_MAX} chars`);
    if (!isIconId(s.icon)) out.push(`step ${i + 1}: unknown icon ${String(s.icon)}`);
  });
  return out;
}
