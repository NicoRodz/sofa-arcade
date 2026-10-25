// Game registry: the lobby lists these and the choice travels to the phones as an id.
// Each game also declares its controls (what the stick and the two buttons are called) and its quick "how to play" steps:
// the relay sends both to the phones with the lobby config, so a new game needs no change in the controller.
// F4a: the types live in ./contract (the game contract, EXPERIMENTAL) and each game's entry in games/<id>/manifest.ts; this file keeps the
// list (GAMES), what is derived from it and the authoring checks, and re-exports every name it used to declare.
import { isIconId } from './icons';
import { pizzasManifest, VERSUS_STYLES } from '@pichi/game-pizzas/manifest';
import { obstaculosManifest } from '@pichi/game-obstaculos/manifest';
import { COOP_STYLE, COOP_TEAMS, DEFAULT_MODE, MODE_IDS, isModeId } from './contract/options';
import type { ChoiceSpec, ModeId, ModeSpec } from './contract/options';
import type { ControlLabel, GameControls, GameInfo, HowTo, HowToStep } from './contract/controls';
import type { GameManifest } from './contract/game';
import type { OptionSpec as VoteOptionSpec } from './lobby/vote';

export { COOP_STYLE, COOP_TEAMS, DEFAULT_MODE, MODE_IDS, VERSUS_STYLES, isModeId };
export type { ChoiceSpec, ModeId, ModeSpec, ControlLabel, GameControls, GameInfo, HowTo, HowToStep };
export type { ChoiceValue, OptionSpec, TeamSpec, TeamStyle } from './contract/options';

export const PLATFORM = 'Pichiclub';

/** The choice as a vote.ts option (menus voting engine), so a vote and the lobby read the same registry. */
export const choiceVoteSpec = (c: ChoiceSpec, votable = true): VoteOptionSpec => ({
  key: c.id,
  label: c.label,
  type: 'enum',
  values: c.values.map((v) => ({ id: v.id, label: v.label })),
  default: c.default,
  votable,
});
export type GameDef = GameManifest; // the registry entry is the contract's manifest

export const GAMES = [pizzasManifest, obstaculosManifest] as const satisfies readonly GameDef[];

// Announced games: the menu shows them as a "Próximamente" card (not selectable). Not in GAMES, so config and phones never see them.
// Once a game with the same id is published in GAMES, its announcement stops showing by itself.
export interface SoonDef {
  id: string;
  name: string;
  blurb: string;
}
export const COMING_SOON: readonly SoonDef[] = [
  { id: 'arena', name: 'Arena de empujones', blurb: 'Empuja a tus rivales fuera de la plataforma.' },
];

export type GameId = (typeof GAMES)[number]['id'];
export const GAME_IDS: readonly GameId[] = GAMES.map((g) => g.id);
export const DEFAULT_GAME: GameId = GAMES[0].id;
export const isGameId = (v: unknown): v is GameId => GAME_IDS.includes(v as GameId);
export const playersLabel = (g: Pick<GameDef, 'minPlayers' | 'maxPlayers'>): string =>
  g.minPlayers === g.maxPlayers ? `${g.minPlayers} jugadores` : `${g.minPlayers} a ${g.maxPlayers} jugadores`;
export const gameName = (id: GameId): string => GAMES.find((g) => g.id === id)?.name ?? id;
// The modes a game plays. A game that declares none gets the single mode its own fields describe: cooperative, one team.
export const resolveModes = (g: GameDef): readonly ModeSpec[] =>
  g.modes?.length ? g.modes : [{ id: 'coop', label: 'Cooperativo', players: [g.minPlayers, g.maxPlayers], teams: COOP_TEAMS }];
export const defaultModeOf = (g: GameDef): ModeId => g.defaultMode ?? resolveModes(g)[0]!.id;
// The mode with that id; an unknown or missing one falls back to the game's default.
export const modeOf = (g: GameDef, id?: string): ModeSpec => {
  const modes = resolveModes(g);
  return modes.find((m) => m.id === id) ?? modes.find((m) => m.id === defaultModeOf(g)) ?? modes[0]!;
};
export const selectableModes = (g: GameDef): ModeSpec[] => resolveModes(g).filter((m) => !m.soon);
export const hasModeChoice = (g: GameDef): boolean => selectableModes(g).length > 1; // the lobby shows the selector only then

// What the phones get: the game's labels, with the mode's overrides on top.
export const gameInfo = (id: string, games: readonly GameDef[] = GAMES, modeId?: string): GameInfo => {
  const g: GameDef = games.find((x) => x.id === id) ?? games[0]!;
  const m = g.modes?.find((x) => x.id === modeId);
  return { controls: m?.controls ? { ...g.controls, ...m.controls } : g.controls, howTo: m?.howTo ?? g.howTo };
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
  label('stick', g.controls.stick);
  label('btn1', g.controls.btn1);
  label('btn2', g.controls.btn2);
  if (!Number.isInteger(g.minPlayers) || !Number.isInteger(g.maxPlayers) || g.minPlayers < 1 || g.maxPlayers < g.minPlayers)
    out.push(`players: bad range ${g.minPlayers}-${g.maxPlayers}`);
  const n = g.howTo.steps.length;
  if (n < HOWTO_MIN_STEPS || n > HOWTO_MAX_STEPS) out.push(`howTo: ${n} steps, want ${HOWTO_MIN_STEPS}-${HOWTO_MAX_STEPS}`);
  g.howTo.steps.forEach((s, i) => {
    if (!s.text.trim()) out.push(`step ${i + 1}: empty text`);
    if (s.text.length > STEP_MAX) out.push(`step ${i + 1}: text over ${STEP_MAX} chars`);
    if (!isIconId(s.icon)) out.push(`step ${i + 1}: unknown icon ${String(s.icon)}`);
  });
  out.push(...modeProblems(g));
  return out;
}

// Authoring check for the declared modes (a game with none is inferred and always fine). Empty list = fine.
function modeProblems(g: GameDef): string[] {
  const out: string[] = [];
  const modes = g.modes ?? [];
  if (g.defaultMode && !modes.some((m) => m.id === g.defaultMode)) out.push(`defaultMode ${g.defaultMode} is not declared`);
  if (modes.length && modes.every((m) => m.soon)) out.push('modes: none is selectable');
  if (new Set(modes.map((m) => m.id)).size !== modes.length) out.push('modes: duplicated id');
  for (const m of modes) {
    const at = `mode ${m.id}`;
    if (!isModeId(m.id)) out.push(`${at}: unknown id`);
    if (!m.label.trim()) out.push(`${at}: empty label`);
    const [lo, hi] = m.players;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < g.minPlayers || hi > g.maxPlayers || hi < lo)
      out.push(`${at}: players ${lo}-${hi} outside the game's ${g.minPlayers}-${g.maxPlayers}`);
    if (m.teams) {
      const [tMin, tMax] = m.teams.count;
      if (!Number.isInteger(tMin) || !Number.isInteger(tMax) || tMin < 1 || tMax < tMin) out.push(`${at}: bad team count ${tMin}-${tMax}`);
      if (!(m.teams.maxRatio >= 1)) out.push(`${at}: maxRatio under 1`);
      if (m.teams.styles && m.teams.styles.length < tMax) out.push(`${at}: ${m.teams.styles.length} styles for up to ${tMax} teams`);
    }
    if (m.id === 'coop' && m.teams && (m.teams.count[0] !== 1 || m.teams.count[1] !== 1)) out.push(`${at}: coop is a single team`);
    if (m.howTo) {
      const n = m.howTo.steps.length;
      if (n < HOWTO_MIN_STEPS || n > HOWTO_MAX_STEPS) out.push(`${at}: howTo ${n} steps, want ${HOWTO_MIN_STEPS}-${HOWTO_MAX_STEPS}`);
      m.howTo.steps.forEach((st, i) => {
        if (!st.text.trim() || st.text.length > STEP_MAX || !isIconId(st.icon)) out.push(`${at}: howTo step ${i + 1} is not legible`);
      });
    }
    const ids = [...(m.options ?? []).map((o) => o.id), ...(m.choices ?? []).map((c) => c.id)];
    if (new Set(ids).size !== ids.length) out.push(`${at}: duplicated option id`);
    for (const c of m.choices ?? []) {
      if (
        !c.label.trim() ||
        c.values.length < 2 ||
        new Set(c.values.map((v) => v.id)).size !== c.values.length ||
        !c.values.some((v) => v.id === c.default)
      )
        out.push(`${at}: choice ${c.id} is not valid`);
      if (c.values.some((v) => !v.label.trim() || v.id.length > 32)) out.push(`${at}: choice ${c.id} has an unreadable value`);
    }
  }
  return out;
}
