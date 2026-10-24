// Versus in the lobby (design pizzas-modalidades-coop-versus §3), as pure functions the screen and the tests share: can the mode be
// picked, how the connected players are split into teams, which versus maps fit the teams, and how the lobby turns into a round.
// No DOM, no clock, no I/O: the host (the screen) owns the state, this only computes the next one.
import type { Difficulty } from './difficulty';
import type { ChoiceSpec, ModeSpec } from './games';
import { generateVersus } from './generate';
import { parseMap, type Pos, type SigmaName } from './maps';
import { addPlayer, createGame, type Game } from './overcooked';
import type { Emitter, GameEvents } from './events';
import type { Rng } from './rng';
import type { MatchStart } from './protocol';
import { balanceTeams, joinSmallestTeam, leaveTeams, makeTeams, modeAvailability, validateTeamSetup, type TeamInfo, type TeamSetup } from './teams';
import { kitchenRegions } from './versus';
import { CATAPULT_CHAR, SABOTAGE_OPTION, defaultSabotage, isSabotageMode, sabotageOf } from './sabotage-config';
import { VERSUS_AUTO, VERSUS_MAPS, VERSUS_RANDOM, versusMap, type VersusChoice } from './versusMaps';

// --- Map choice ---------------------------------------------------------------------------------------------------------------------

// VERSUS_AUTO ("Aleatorio": one of the maps that fit the teams) and VERSUS_RANDOM ("Mapa generado": built from the lobby seed) live in versusMaps.ts.
export { VERSUS_AUTO, VERSUS_RANDOM, VERSUS_CHOICES, isVersusChoice, type VersusChoice } from './versusMaps';

// --- Can the mode be picked? --------------------------------------------------------------------------------------------------------

export const VERSUS_MIN_EVEN = 4; // an even lobby needs 2 against 2 at least (1 against 1 is not offered)

export interface VersusAvailability { ok: boolean; reason: string; notice: string; k: number } // reason: why not (empty when ok); notice: a heads-up that does not block

/**
 * Versus with `n` players connected. Even: 4, 6 or 8 (even teams, k = 1). Odd: the balanced split must pass validateTeamSetup, i.e. the
 * small team gets the k multiplier (3: 2 against 1, 1.41; 5: 3 against 2, 1.22; 7: 4 against 3, 1.15). The mode is shown disabled
 * with `reason` when it is not ok.
 */
export function versusAvailability(mode: Pick<ModeSpec, 'players' | 'teams'>, n: number): VersusAvailability {
  const no = (reason: string): VersusAvailability => ({ ok: false, reason, notice: '', k: 1 });
  const range = modeAvailability(mode, n);
  if (!range.ok) return no(range.reason);
  if (n % 2 === 0 && n < VERSUS_MIN_EVEN) return no(`Hay ${n} jugadores: el Versus necesita al menos ${VERSUS_MIN_EVEN} (2 contra 2)`);
  const split = balanceTeams(Array.from({ length: n }, (_v, i) => i + 1), 2, 0);
  const setup = validateTeamSetup(mode, split);
  if (!setup.ok) return no(setup.problems[0]!);
  const k = Math.max(...setup.k);
  const [big, small] = [Math.max(...split.map((t) => t.length)), Math.min(...split.map((t) => t.length))];
  const notice = big === small ? '' : `${big} contra ${small}: el equipo de ${small} gana un multiplicador ×${k}${n === 3 ? '. Con 3 conviene más el Cooperativo' : ''}`;
  return { ok: true, reason: '', notice, k };
}

// --- Teams in the lobby -------------------------------------------------------------------------------------------------------------

const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * The lobby's teams after the connected players changed. `ids` are the connected players (a dropped one leaves its team and, when it
 * comes back, joins the smallest). While nobody moved a player by hand (`touched` false) the split is rebalanced with the previous
 * teams as a hint (balanceTeams keeps what the sizes allow); once somebody did, only the arrivals and departures are applied.
 * Returns the same array when nothing changed. Null when the mode has no teams.
 */
export function syncTeams(mode: Pick<ModeSpec, 'teams'>, teams: readonly TeamInfo[] | null, ids: readonly number[], seed: number, touched: boolean): TeamInfo[] | null {
  const spec = mode.teams;
  if (!spec || spec.count[1] < 2) return null;
  const want = [...new Set(ids)];
  const empty = (): TeamInfo[] => makeTeams(mode, [], seed)!;
  if (!teams?.length) return want.length >= spec.count[0] ? makeTeams(mode, want, seed)! : want.reduce((t, id) => joinSmallestTeam(t, id), empty()); // the first split is dealt with the seed
  const have = teams.flatMap((t) => t.playerIds);
  if (sameSet(have, want)) return teams as TeamInfo[];
  if (!touched && want.length >= spec.count[0]) return makeTeams(mode, want, seed, teams);
  const gone = have.filter((id) => !want.includes(id));
  const left = gone.reduce((t, id) => leaveTeams(t, id), teams as readonly TeamInfo[]);
  return want.filter((id) => !have.includes(id)).reduce((t, id) => joinSmallestTeam(t, id), [...left]);
}

export const teamSizes = (teams: readonly Pick<TeamInfo, 'playerIds'>[] | null | undefined): number[] => (teams ?? []).map((t) => t.playerIds.length);

/** Is the lobby's current split a legal start? Problems are lobby texts. A lobby without teams is not a versus lobby: not ok. */
export function lobbySetup(mode: Pick<ModeSpec, 'players' | 'teams'>, teams: readonly Pick<TeamInfo, 'playerIds'>[] | null): TeamSetup {
  if (!teams) return { ok: false, problems: ['Faltan los equipos'], k: [] };
  return validateTeamSetup(mode, teams.map((t) => t.playerIds));
}

// --- Versus maps that fit -----------------------------------------------------------------------------------------------------------

export type VersusMapStatus = { state: 'recommended' } | { state: 'blocked'; reason: string };

/** A map fits when the total is inside its range and the biggest team has a start tile each in its kitchen. */
export function versusMapStatus(m: { nMin: number; nMax: number; versus: { spawns: readonly (readonly Pos[])[] } }, sizes: readonly number[]): VersusMapStatus {
  const total = sizes.reduce((a, b) => a + b, 0), biggest = Math.max(0, ...sizes);
  if (total > m.nMax) return { state: 'blocked', reason: `hasta ${m.nMax} jugadores` };
  if (total < m.nMin) return { state: 'blocked', reason: `necesita ${m.nMin}+ jugadores` };
  const room = Math.min(...m.versus.spawns.map((s) => s.length));
  if (biggest > room) return { state: 'blocked', reason: `caben ${room} por cocina` };
  return { state: 'recommended' };
}

/** Every versus map with its status for these team sizes; the ones that fit come first. */
export function versusLobbyMaps(sizes: readonly number[]) {
  const all = VERSUS_MAPS.map((map) => ({ map, status: versusMapStatus(map, sizes) }));
  return [...all.filter((x) => x.status.state === 'recommended'), ...all.filter((x) => x.status.state !== 'recommended')];
}

/** The versus map the lobby proposes: the first that fits and was not played yet (any that fits once all were), else "auto". */
export function defaultVersusChoice(sizes: readonly number[], played: ReadonlySet<string>): VersusChoice {
  const fit = versusLobbyMaps(sizes).filter((x) => x.status.state === 'recommended').map((x) => x.map.id);
  return (fit.find((id) => !played.has(id)) ?? fit[0] ?? VERSUS_AUTO) as VersusChoice;
}

export interface ResolvedVersusMap { id: string; name: string; rows: readonly string[]; spawns: readonly Pos[]; sigma: SigmaName; shared?: readonly Pos[] } // shared: the tiles of a shared pantry (V2)

/**
 * The map a lobby choice stands for. `spawns` is kitchen A's starts followed by kitchen B's (createGame keeps each team's own, in order).
 * "auto" draws among the maps that fit (`rand` is injected); "random" generates one from the lobby seed for the biggest team (2 x biggest chefs).
 */
export function resolveVersusMap(choice: string, seed: number, difficulty: Difficulty, sizes: readonly number[], rand: Rng): ResolvedVersusMap {
  const biggest = Math.max(1, ...sizes);
  if (choice === VERSUS_RANDOM) {
    const g = generateVersus(seed, difficulty, Math.max(2, Math.min(8, 2 * biggest)));
    return { id: 'vs-gen', name: `Versus ${seed}`, rows: g.rows, spawns: [...g.spawns[0], ...g.spawns[1]], sigma: g.sigma };
  }
  const fit = versusLobbyMaps(sizes).filter((x) => x.status.state === 'recommended').map((x) => x.map);
  const m = (choice === VERSUS_AUTO ? undefined : versusMap(choice)) ?? (fit.length ? fit[Math.floor(rand() * fit.length)]! : versusMap('V1')!);
  return { id: m.id, name: m.name, rows: m.rows, spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]], sigma: m.versus.sigma, ...(m.versus.shared?.length ? { shared: m.versus.shared } : {}) };
}

/** "izquierda" / "derecha" or "arriba" / "abajo" for each kitchen of a map, from where its floor really is (team 0 = the region met first). */
export function kitchenSides(rows: readonly string[], spawns: readonly Pos[], teamCount = 2): string[] {
  const grid = parseMap(rows, true);
  const { comp, regions } = kitchenRegions(grid, teamCount, spawns);
  const centre = regions.map((r) => {
    let sx = 0, sy = 0, n = 0;
    comp.forEach((row, y) => row.forEach((c, x) => { if (c === r) { sx += x; sy += y; n++; } }));
    return { x: sx / n, y: sy / n };
  });
  const spreadX = Math.max(...centre.map((c) => c.x)) - Math.min(...centre.map((c) => c.x));
  const spreadY = Math.max(...centre.map((c) => c.y)) - Math.min(...centre.map((c) => c.y));
  const side = spreadX >= spreadY;
  const order = centre.map((c, i) => ({ i, v: side ? c.x : c.y })).sort((a, b) => a.v - b.v).map((o) => o.i);
  return centre.map((_c, i) => (side ? ['izquierda', 'derecha'] : ['arriba', 'abajo'])[order.indexOf(i)]!);
}

// --- Lobby -> round -----------------------------------------------------------------------------------------------------------------

// The lobby's options of a mode: its toggles at their defaults and its choices; the sabotage level follows the difficulty (Suave on Fácil and Normal, Caos on Difícil).
export const defaultModeOptions = (mode: Pick<ModeSpec, 'options' | 'choices'>, difficulty?: Difficulty): Record<string, boolean | string> => ({
  ...Object.fromEntries((mode.options ?? []).map((o) => [o.id, o.default])),
  ...Object.fromEntries((mode.choices ?? []).map((c) => [c.id, c.id === SABOTAGE_OPTION && difficulty ? defaultSabotage(difficulty) : c.default])),
});

/** The value of a choice that a Left / Right key (the keyboard, or the Captain's D-pad) selects: the previous or the next one, and null at the ends (nothing to change). */
export function stepChoice(c: Pick<ChoiceSpec, 'values'>, current: unknown, key: string): string | null {
  const i = c.values.findIndex((v) => v.id === current);
  const to = key === 'ArrowLeft' ? i - 1 : key === 'ArrowRight' ? i + 1 : NaN;
  if (Number.isNaN(to) || i < 0) return null;
  return c.values[to]?.id ?? null;
}

/** Why the chosen sabotage level will not run on this map ('' when it will, or when it is off): the map has no catapult. */
export function sabotageNotice(mode: unknown, rows: readonly string[] | null): string {
  if (!isSabotageMode(mode) || mode === 'off' || !rows) return '';
  return rows.some((r) => r.includes(CATAPULT_CHAR)) ? '' : 'Este mapa no tiene catapulta: se juega sin sabotaje';
}

export interface VersusStart {
  teams: readonly TeamInfo[]; // frozen at the start, each with the side of its kitchen
  map: ResolvedVersusMap;
  difficulty: Difficulty;
  seed: number;
  modeOptions: Record<string, boolean | number | string>;
  slotOf: (playerId: number) => number; // the chef (colour) of a player
  bus?: Emitter<GameEvents>;
  countdownMs?: number;
}

/** The teams with `side` set from the map's real kitchens. */
export const withSides = (teams: readonly TeamInfo[], map: Pick<ResolvedVersusMap, 'rows' | 'spawns'>): TeamInfo[] => {
  const sides = kitchenSides(map.rows, map.spawns, teams.length);
  return teams.map((t, i) => ({ ...t, side: sides[i]! }));
};

/** The lobby's choices as a running round: createGame with the teams (ids = position), the versus map and the handicap option, every chef added to its team. */
export function createVersusGame(o: VersusStart): Game {
  const game = createGame({
    mapId: o.map.id, difficulty: o.difficulty, rows: o.map.rows, spawns: o.map.spawns, seed: o.seed, countdownMs: o.countdownMs, bus: o.bus,
    teams: o.teams.map((t) => ({ playerIds: t.playerIds })), handicap: o.modeOptions.handicap !== false, shared: o.map.shared,
    sabotage: sabotageOf(o.modeOptions), sigma: o.map.sigma, // the sim switches it off by itself on a map with no catapult
  });
  for (const t of o.teams) t.playerIds.forEach((id, rank) => addPlayer(game, id, o.slotOf(id), rank));
  return game;
}

export interface VersusRound { game: Game; teams: TeamInfo[]; map: ResolvedVersusMap; match: MatchStart }
export interface VersusRoundOpts {
  teams: readonly TeamInfo[]; // the lobby's teams (frozen here)
  choice: string; // config.map: V1.., vs-auto or vs-random
  difficulty: Difficulty; seed: number;
  modeOptions: Record<string, boolean | number | string>;
  slotOf: (playerId: number) => number;
  rand: Rng;
  bus?: Emitter<GameEvents>; countdownMs?: number;
}
/**
 * The whole step from the lobby to a running round, for the screen and for the tests: resolves the map for the team sizes, writes the
 * kitchen side into each team, builds the game and the `match` the phones are told. Same teams + map choice + seed = same round.
 */
export function startVersusRound(o: VersusRoundOpts): VersusRound {
  const map = resolveVersusMap(o.choice, o.seed, o.difficulty, teamSizes(o.teams), o.rand);
  const teams = withSides(o.teams, map);
  const game = createVersusGame({ teams, map, difficulty: o.difficulty, seed: o.seed, modeOptions: o.modeOptions, slotOf: o.slotOf, bus: o.bus, countdownMs: o.countdownMs });
  return { game, teams, map, match: { gameId: 'pizzas', modeId: 'versus', mapId: map.id, difficulty: o.difficulty, teams, modeOptions: o.modeOptions } };
}
