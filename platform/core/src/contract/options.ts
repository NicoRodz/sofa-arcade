// Modes, teams and lobby options a game declares in its manifest. EXPERIMENTAL (F4a).
// Moved from games.ts without changes; games.ts re-exports every name.
// Modes (design pizzas-modalidades-coop-versus §4). A game may declare several ways to play; the lobby shows a selector only when
// it declares more than one. Cooperative = the team mechanism with a single team, so there is one code path for every mode.
import type { HowTo, GameControls } from './controls';

export const MODE_IDS = ['coop', 'versus', 'ffa', 'teams', 'race'] as const;
export type ModeId = (typeof MODE_IDS)[number];
export const DEFAULT_MODE: ModeId = 'coop';
export const isModeId = (v: unknown): v is ModeId => MODE_IDS.includes(v as ModeId);
export interface TeamStyle {
  name: string;
  color: string;
  icon: string;
} // icon is a glyph: colour alone must not tell the teams apart
// count: how many teams (inclusive range). maxRatio: biggest team / smallest team the lobby accepts (1 = even teams only).
// handicap: what helps the smaller team: 'score-k' multiplies its points, 'game' is the game's own rule, 'none' nothing.
export interface TeamSpec {
  count: readonly [min: number, max: number];
  maxRatio: number;
  handicap: 'score-k' | 'none' | 'game';
  styles?: readonly TeamStyle[];
}
export interface OptionSpec {
  id: string;
  label: string;
  default: boolean;
} // lobby toggles of a mode; the values travel as the opaque modeOptions
// A lobby choice among a few named values (the sabotage: Apagado / Suave / Caos). It travels in modeOptions as the value's id, and it is the same shape a
// phone vote needs (choiceVoteSpec): the lobby changes it with the pills, with Left / Right (the Captain's D-pad sends those keys), and a vote could too.
export interface ChoiceValue {
  id: string;
  label: string;
  blurb?: string;
}
export interface ChoiceSpec {
  id: string;
  label: string;
  values: readonly ChoiceValue[];
  default: string;
}
export interface ModeSpec {
  id: ModeId;
  label: string;
  players: readonly [min: number, max: number]; // total players the mode admits
  teams?: TeamSpec; // absent: the mode has no teams (free for all)
  howTo?: HowTo;
  controls?: Partial<GameControls>; // override the game's own when the mode changes them
  options?: readonly OptionSpec[];
  choices?: readonly ChoiceSpec[]; // lobby choices among named values (the sabotage level)
  soon?: boolean; // declared but not selectable yet (the lobby does not offer it)
}
export const COOP_STYLE: TeamStyle = { name: 'Equipo', color: '#F4C430', icon: '★' };
export const COOP_TEAMS: TeamSpec = { count: [1, 1], maxRatio: 1, handicap: 'none', styles: [COOP_STYLE] };
