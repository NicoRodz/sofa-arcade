import type { Difficulty } from '../difficulty';
import type { ModeId } from '../contract/options';
import type { Slots } from '../contract/slots';
import type { IconId } from '../icons';
import type { ModeOptions } from '../lobby/parse';
import type { TeamInfo } from '../lobby/teams';
import type { Phase } from './constants';

export interface Score {
  id: number;
  score: number;
}
// Suggested stations for the round: the screen assigns them, the phones show them. Never enforced. The ids are the game's own (Slots['puesto']).
export interface PuestoAssign<S extends Slots = Slots> {
  id: number;
  puestos: S['puesto'][];
  pool: S['puesto'][];
} // pool: what "Cambiar" cycles through
export interface PuestoMsg<S extends Slots = Slots> {
  cheese: boolean;
  sink: boolean;
  assign: PuestoAssign<S>[];
}
// How a round starts (sent with phase 'playing'): the lobby choices frozen. modeOptions is opaque here: each game types its own.
export interface MatchStart {
  gameId: string;
  modeId: ModeId;
  mapId: string;
  difficulty: Difficulty;
  teams: TeamInfo[] | null;
  modeOptions: ModeOptions;
}
export interface PhaseInfo<S extends Slots = Slots> {
  phase: Phase;
  scores?: Score[];
  puestos?: PuestoMsg<S>;
  match?: MatchStart;
  result?: S['result'];
} // result: versus only, with phase 'results'

// What A and B say on one phone right now, sent with the state of every sim tick (not as an event: a late packet is simply replaced by the next).
// a / b: the label (null: the game's own). aIcon / bIcon: the glyph the button wears (absent: the game's own). aOff / bOff: nothing to do now, the button greys out.
export interface HintLabels {
  a: string | null;
  b: string | null;
  aIcon?: IconId;
  bIcon?: IconId;
  aOff?: boolean;
  bOff?: boolean;
}
/** The optional fields of a hint, copied only when set (the relay forwards exactly these, nothing else from the payload). */
export const hintExtras = (h: HintLabels): Omit<HintLabels, 'a' | 'b'> => ({
  ...(h.aIcon ? { aIcon: h.aIcon } : {}),
  ...(h.bIcon ? { bIcon: h.bIcon } : {}),
  ...(h.aOff ? { aOff: true } : {}),
  ...(h.bOff ? { bOff: true } : {}),
});
