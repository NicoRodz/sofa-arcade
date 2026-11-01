// What the platform's part of the lobby shows (the player cards, the difficulty pills, the join card, the Captain's notice), as plain data: the templates
// (view.ts) only draw it. Pure functions of the state, tested without a DOM. The game's half of the lobby is not here (ScreenGame.lobby.render).
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty, type PublicPlayer } from '@pichi/core';
import { chefOf } from '../../art/tokens';

export const WAITING = 'Esperando…';
export const CAPTAIN_NOTICE = 'Capitán: elige desde tu teléfono';

export interface ChipView {
  slot: number;
  num: number; // the number on the card (slot + 1)
  name: string; // '👑 ' goes before the Captain's name
  sub: { making: boolean; text: string }; // making: the pen and "armando su personaje…" (text is '')
  // classes of the chip shell (the element itself, which games move into their team columns); the template only draws what is inside it
  classes: { empty: boolean; gone: boolean; chef: boolean; helper: boolean; making: boolean };
}

/** One player card per slot: `info` is the player seated there (undefined: the "Esperando…" card). */
export function chipView(slot: number, info: PublicPlayer | undefined, captainId: number | null): ChipView {
  const base = { slot, num: slot + 1 };
  if (!info) {
    return {
      ...base,
      name: WAITING,
      sub: { making: false, text: '' },
      classes: { empty: true, gone: false, chef: false, helper: false, making: false },
    };
  }
  const helper = !!info.assist;
  const making = !!info.customizing;
  const sub = !info.connected
    ? { making: false, text: 'Desconectado' }
    : making
      ? { making: true, text: '' }
      : { making: false, text: `${chefOf(slot).name} · ${helper ? 'Ayudante' : 'listo'}` };
  return {
    ...base,
    name: (info.id === captainId ? '👑 ' : '') + info.name,
    sub,
    classes: { empty: false, gone: !info.connected, chef: !info.ap, helper, making: making && info.connected },
  };
}

export interface DiffPill {
  id: Difficulty;
  label: string;
  selected: boolean;
}
export const diffPills = (current: Difficulty): DiffPill[] =>
  DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_LABEL[d], selected: d === current }));

export interface JoinView {
  code: string;
  qrSvg: string; // '' until /api/info answers
  url: string;
}
export const joinUrl = (url: string) => url.replace(/^http:\/\//, '');
export const NO_URL = 'no se pudo obtener la URL';

export const playersCount = (connected: number) => `${connected}/8`;

/** The setup panel (difficulty + the game's rows) shows unless the game says it has nothing to configure (Arena). */
export const setupVisible = (lobby: { noOptions?: true }) => !lobby.noOptions;
