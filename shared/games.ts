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
      btn2: { label: 'Picar / Correr', icon: 'chop' }, // held to chop; a tap with empty hands and no station in front dashes (R2). No "hold" hint: it would not fit under the longer label
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

export type GameId = (typeof GAMES)[number]['id'];
export const GAME_IDS: readonly GameId[] = GAMES.map((g) => g.id);
export const DEFAULT_GAME: GameId = GAMES[0].id;
export const isGameId = (v: unknown): v is GameId => GAME_IDS.includes(v as GameId);
export const gameName = (id: GameId): string => GAMES.find((g) => g.id === id)?.name ?? id;
export const gameInfo = (id: string, games: readonly GameDef[] = GAMES): GameInfo => {
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
