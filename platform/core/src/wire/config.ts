import type { GameInfo } from '../contract/controls';
import type { ModeId } from '../contract/options';
import type { Slots } from '../contract/slots';
import type { Difficulty } from '../difficulty';
import type { Appearance } from '../avatar';
import type { ModeOptions } from '../lobby/parse';
import type { TeamInfo } from '../lobby/teams';

// modeId + teams + teamsLocked: the lobby's mode and its teams (null until assigned; the screen owns them, the relay derives each phone's team from them).
export interface LobbyConfig<S extends Slots = Slots> {
  game: string;
  difficulty: Difficulty;
  map: S['map'];
  seed: number;
  modeId: ModeId;
  teams: TeamInfo[] | null;
  teamsLocked: boolean;
  modeOptions: ModeOptions;
}
// What a screen may send: a v1 screen leaves the team fields out and the parser fills the defaults (cooperative, no teams).
export type ConfigFromScreen<S extends Slots = Slots> = Omit<LobbyConfig<S>, 'modeId' | 'teams' | 'teamsLocked' | 'modeOptions'> &
  Partial<Pick<LobbyConfig<S>, 'modeId' | 'teams' | 'teamsLocked' | 'modeOptions'>>;

// What the phones receive: the lobby config plus the chosen game's control labels and how-to steps (from the catalog).
export type ConfigMsg<S extends Slots = Slots> = { t: 'config' } & LobbyConfig<S> & GameInfo;
export const configMsgOf = <S extends Slots>(cfg: LobbyConfig<S>, info: GameInfo): ConfigMsg<S> => ({ t: 'config', ...cfg, ...info });

export interface PublicPlayer {
  id: number;
  name: string;
  color: string;
  slot: number;
  connected: boolean;
  teamId: number | null; // the relay fills it from the lobby teams; null: no teams assigned (or a spectator)
  assist?: true; // the player chose Ayudante in the lobby (assist.ts); absent otherwise
  ap?: Appearance; // the sanitized look (avatar/); always set by the relay; absent from an older relay
  customizing?: boolean; // the phone is in the character creator now (absent: no)
  school?: true; // this phone already did (or skipped) the Cocina escuela: the relay keeps it with the slot, the screen does not offer the school when everybody has it
}
// Cocina escuela, screen -> one phone: where this chef is (step of `total`, step === total: finished), what to do (<= 8 words), and which button to light.
export interface SchoolMsg {
  step: number;
  total: number;
  text: string;
  btn?: 'a' | 'b';
  done?: true;
}
