// Game registry: the lobby lists these and the choice travels to the phones as an id.
// Each game also declares its controls (what the stick and the two buttons are called) and its quick "how to play" steps:
// the relay sends both to the phones with the lobby config, so a new game needs no change in the controller.
import { isIconId, type IconId } from './icons';
import { SABOTAGE_BLURB, SABOTAGE_LABEL, SABOTAGE_MODES, SABOTAGE_OPTION } from './sabotage-config';
import type { OptionSpec as VoteOptionSpec } from './vote';

export const PLATFORM = 'Pichiclub';

export interface ControlLabel {
  label: string;
  icon: IconId;
  hold?: boolean;
} // hold: the button is meant to be kept pressed
export interface GameControls {
  stick: ControlLabel;
  btn1: ControlLabel;
  btn2: ControlLabel;
} // btn1 = bit 0 / presses[0], btn2 = bit 1 / presses[1]
export interface HowToStep {
  icon: IconId;
  text: string;
}
export interface HowTo {
  steps: readonly HowToStep[];
  note?: string;
}
export interface GameInfo {
  controls: GameControls;
  howTo: HowTo;
}

// Modes (design pizzas-modalidades-coop-versus §4). A game may declare several ways to play; the lobby shows a selector only when
// it declares more than one. Cooperative = the team mechanism with a single team, so there is one code path for every mode.
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
/** The choice as a vote.ts option (menus voting engine), so a vote and the lobby read the same registry. */
export const choiceVoteSpec = (c: ChoiceSpec, votable = true): VoteOptionSpec => ({
  key: c.id,
  label: c.label,
  type: 'enum',
  values: c.values.map((v) => ({ id: v.id, label: v.label })),
  default: c.default,
  votable,
});
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
export const VERSUS_STYLES: readonly TeamStyle[] = [
  // chili red-orange + triangle against navy + circle: apart for colour-blind players too. Both are darker than every chef colour (palette in
  // protocol.ts COLORS): the first draft (#F26A1B, #1E6BD6) sat at a perceptual distance of 7 and 9 from the orange and blue chefs, these at 22 and 31.
  { name: 'Picantes', color: '#A8330A', icon: '▲' },
  { name: 'Frescos', color: '#14338A', icon: '●' },
];
export const COOP_TEAMS: TeamSpec = { count: [1, 1], maxRatio: 1, handicap: 'none', styles: [COOP_STYLE] };

export interface GameDef extends GameInfo {
  id: string;
  name: string;
  blurb: string;
  minPlayers: number;
  maxPlayers: number;
  modes?: readonly ModeSpec[];
  defaultMode?: ModeId;
} // the range is inclusive; the menu card shows it and disables itself outside it

export const GAMES = [
  {
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
  },
  {
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
  },
] as const satisfies readonly GameDef[];

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
