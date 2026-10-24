// Pure team rules shared by the lobby, the relay and the sim (design pizzas-modalidades-coop-versus §1 and §4). No clock, no I/O.
// Cooperative is the same mechanism with one team, so everything here works for 1..MAX_TEAMS teams.
import { COOP_STYLE, type ModeSpec, type TeamSpec, type TeamStyle } from './games';
import { mulberry32, type Rng } from './rng';
import { ASSIST_IMMUNITY_K, effectiveChefs } from './assist';

// What the repo says about the design's open questions (resolved in F0):
//  1-2. Maps are 16x9 strings (maps.ts, 15 FIXED_MAPS). Legend: # wall . floor S spawn ~ water C counter 1/2/3 dough/tomato/cheese crate
//       K board O oven P plates E window X trash U dirty return L sink. The design's M T Q C H letters map to 1 2 3 K O (see maps.ts);
//       there is no barrier tile yet ('|' in the design): F3 adds it or uses '#'.
//  3. The screen (the Mac) is the host and owns the lobby; phones never change it. The relay only stores the config and forwards.
//  4. The sim is deterministic: only mulberry32(seed) in spawnOrder, no Math.random, no clock. Same (map, difficulty, n, seed, inputs)
//     gives the same round (shared/golden proves it). The sim runs in the screen, not in the server.
//  5. Today a dropped phone leaves its chef standing; the relay keeps the slot SLOT_GRACE_MS and then the screen deletes the chef.
//  6. A pizza is built in the oven ('pot'): cut dough + tomato (+ cheese) go in, it cooks, then a plate picks it up.
//  7. There are no bots; the relay test has raw ws clients. Bots for F3 must drive the in-process sim (as golden/bot.ts does) or speak ws.
export type TeamId = number;
export interface TeamInfo { id: TeamId; name: string; color: string; icon: string; side?: string; playerIds: number[] } // side: "izquierda" / "arriba", set once the map is known
export const MAX_TEAMS = 4;
export const HANDICAP_MAX_RATIO = 2; // 3v1 is refused; 2v1 (k 1.41) and 3v2 (k 1.22) are fine
export const GHOST_MS = 20_000; // a dropped chef keeps its place in the match this long (the relay keeps the slot longer: SLOT_GRACE_MS)

const sortedUnique = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);
const shuffle = <T>(list: readonly T[], rng: Rng): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
};

// --- Balanced assignment ------------------------------------------------------------------------------------------

/**
 * Splits the players into `teamCount` teams whose sizes differ by at most one. The same players and seed always give the same
 * split, whatever the order the ids come in. `previous` (the teams of the last round, by index) is respected as far as the
 * sizes allow, so a rematch keeps the teams; the players it cannot keep, and the new ones, are shuffled with the seed.
 * Throws when a team would be empty (fewer players than teams).
 */
export function balanceTeams(playerIds: readonly number[], teamCount: number, seed: number, previous?: readonly (readonly number[])[]): number[][] {
  const ids = sortedUnique(playerIds);
  const n = ids.length;
  if (!Number.isInteger(teamCount) || teamCount < 1) throw new RangeError(`teamCount ${teamCount}`);
  if (n < teamCount) throw new RangeError(`${n} players cannot fill ${teamCount} teams`);
  const rng = mulberry32(seed);
  const base = Math.floor(n / teamCount), extra = n % teamCount;
  const held = (t: number) => ids.filter((id) => previous?.[t]?.includes(id)).length;
  // the teams that carried more players last time keep the extra seats; ties by seed
  const order = shuffle(Array.from({ length: teamCount }, (_v, t) => t), rng).sort((a, b) => held(b) - held(a));
  const size = Array.from({ length: teamCount }, () => base);
  for (let i = 0; i < extra; i++) size[order[i]!]!++;
  const teams: number[][] = Array.from({ length: teamCount }, () => []);
  const rest: number[] = [];
  for (const id of ids) {
    const t = previous?.findIndex((p) => p.includes(id)) ?? -1;
    if (t >= 0 && t < teamCount && teams[t]!.length < size[t]!) teams[t]!.push(id); else rest.push(id);
  }
  for (const id of shuffle(rest, rng)) {
    const t = teams.findIndex((tm, i) => tm.length < size[i]!);
    teams[t]!.push(id);
  }
  return teams.map((t) => t.sort((a, b) => a - b));
}

// --- Handicap -----------------------------------------------------------------------------------------------------

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Multiplier for the points of a team of `nOwn` chefs against `nRival`: max(1, sqrt(rival / own)), two decimals (what the HUD
 * shows is what is applied). Kitchen output does not grow linearly with chefs, hence the root. Returns null when the setup is
 * refused: a team without players, or a ratio above `maxRatio` (default 2: 3v1 is out). Pass Infinity to compute it anyway.
 */
export function handicapK(nOwn: number, nRival: number, maxRatio = HANDICAP_MAX_RATIO): number | null {
  if (!(nOwn > 0) || !(nRival > 0)) return null;
  if (Math.max(nOwn, nRival) / Math.min(nOwn, nRival) > maxRatio) return null;
  return Math.max(1, round2(Math.sqrt(nRival / nOwn)));
}

/**
 * k per team, in the order of `counts`: every team is measured against the biggest one. Null when any team is refused (see handicapK).
 * `assists` (Ayudante chefs per team, same order; absent = none): each one weighs ASSIST_WEIGHT of a chef, and its team gives up ASSIST_IMMUNITY_K of k per
 * Ayudante for the immunity to sabotage. The legal split is still judged on the real counts. With no Ayudantes every number is what it always was.
 */
export function teamMultipliers(counts: readonly number[], maxRatio = HANDICAP_MAX_RATIO, assists?: readonly number[]): number[] | null {
  const top = Math.max(...counts);
  const ks = counts.map((c) => handicapK(c, top, maxRatio));
  if (!ks.every((k): k is number => k !== null)) return null;
  if (!assists?.some((a) => a > 0)) return ks as number[];
  const eff = counts.map((c, i) => effectiveChefs(c, assists[i] ?? 0));
  const best = Math.max(...eff);
  return eff.map((e, i) => Math.max(1, round2(round2(Math.sqrt(best / e)) - ASSIST_IMMUNITY_K * (assists[i] ?? 0))));
}

// --- Lobby checks ------------------------------------------------------------------------------------------------

export type Verdict = { ok: true } | { ok: false; reason: string };
const plural = (n: number) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}`;

/** Can this mode be played with n players? (the lobby shows the mode disabled with the reason). */
export function modeAvailability(mode: Pick<ModeSpec, 'players'>, n: number): Verdict {
  const [lo, hi] = mode.players;
  if (n < lo) return { ok: false, reason: `Hay ${plural(n)}: necesita al menos ${lo}` };
  if (n > hi) return { ok: false, reason: `Hay ${plural(n)}: admite hasta ${hi}` };
  return { ok: true };
}

export interface TeamSetup { ok: boolean; problems: string[]; k: number[] } // k: multiplier per team (all 1 when the mode has no score-k handicap)

/** Is this split of players into teams a legal start for the mode? Problems are lobby texts. */
export function validateTeamSetup(mode: Pick<ModeSpec, 'players' | 'teams'>, teams: readonly (readonly number[])[], assist?: ReadonlySet<number>): TeamSetup {
  const problems: string[] = [];
  const spec = mode.teams;
  const counts = teams.map((t) => t.length);
  const total = counts.reduce((a, b) => a + b, 0);
  if (!spec) {
    if (teams.length) problems.push('El modo no usa equipos');
  } else {
    const [lo, hi] = spec.count;
    if (teams.length < lo || teams.length > hi) problems.push(lo === hi ? `Hacen falta ${lo} equipos` : `Hacen falta entre ${lo} y ${hi} equipos`);
    if (counts.some((c) => c === 0)) problems.push('Hay un equipo vacío');
    else if (counts.length && Math.max(...counts) / Math.min(...counts) > spec.maxRatio) problems.push(`Equipos muy desiguales (${counts.join(' contra ')}): máximo ${spec.maxRatio} a 1`);
  }
  const all = teams.flat();
  if (new Set(all).size !== all.length) problems.push('Un jugador está en dos equipos');
  const avail = modeAvailability(mode, total);
  if (!avail.ok) problems.push(avail.reason);
  const ks = !problems.length && spec?.handicap === 'score-k' ? teamMultipliers(counts, spec.maxRatio, assist ? teams.map((t) => t.filter((id) => assist.has(id)).length) : undefined) : null;
  return { ok: problems.length === 0, problems, k: ks ?? counts.map(() => 1) };
}

// --- Team lists (lobby state) -------------------------------------------------------------------------------------

const styleOf = (spec: TeamSpec | undefined, i: number): TeamStyle => spec?.styles?.[i] ?? (spec?.count[1] === 1 ? COOP_STYLE : { name: `Equipo ${i + 1}`, color: '#888888', icon: '■' });

/**
 * The teams for a mode, or null when the mode has none. Coop gives one team with everybody. `previous` keeps the last
 * round's teams on a rematch. The team count is the mode's minimum (Pizzas versus: 2).
 */
export function makeTeams(mode: Pick<ModeSpec, 'teams'>, playerIds: readonly number[], seed: number, previous?: readonly TeamInfo[] | null): TeamInfo[] | null {
  const spec = mode.teams;
  if (!spec) return null;
  const n = new Set(playerIds).size;
  const split = n === 0 ? Array.from({ length: spec.count[0] }, (): number[] => []) : balanceTeams(playerIds, Math.min(spec.count[0], n), seed, previous?.map((t) => t.playerIds));
  return split.map((ids, i) => ({ id: i, ...styleOf(spec, i), playerIds: ids }));
}

export const teamOf = (teams: readonly TeamInfo[] | null | undefined, playerId: number): TeamInfo | undefined => teams?.find((t) => t.playerIds.includes(playerId));
const withPlayers = (teams: readonly TeamInfo[], f: (t: TeamInfo) => number[]): TeamInfo[] => teams.map((t) => ({ ...t, playerIds: f(t) }));

/** Someone enters the lobby: they go to the smallest team (the lowest id on a tie). Already in a team: nothing changes. */
export function joinSmallestTeam(teams: readonly TeamInfo[], playerId: number): TeamInfo[] {
  if (!teams.length || teamOf(teams, playerId)) return [...teams];
  const target = teams.reduce((a, b) => (b.playerIds.length < a.playerIds.length ? b : a));
  return withPlayers(teams, (t) => (t === target ? [...t.playerIds, playerId] : t.playerIds));
}

export const leaveTeams = (teams: readonly TeamInfo[], playerId: number): TeamInfo[] => withPlayers(teams, (t) => t.playerIds.filter((id) => id !== playerId));

export type MoveResult = { ok: true; teams: TeamInfo[] } | { ok: false; reason: string };
/**
 * A phone ("Cambiar de equipo") or the host moves a player to a team. Refused when the teams are locked or the team does not exist.
 * Leaving a team empty or lopsided is allowed here: the start is what validateTeamSetup checks.
 */
export function movePlayer(teams: readonly TeamInfo[], playerId: number, teamId: TeamId, locked: boolean): MoveResult {
  if (locked) return { ok: false, reason: 'Los equipos están bloqueados' };
  if (!teams.some((t) => t.id === teamId)) return { ok: false, reason: 'Ese equipo no existe' };
  return { ok: true, teams: withPlayers(teams, (t) => (t.id === teamId ? [...t.playerIds.filter((id) => id !== playerId), playerId].sort((a, b) => a - b) : t.playerIds.filter((id) => id !== playerId))) };
}

/** The host presses "Mezclar": same teams (names, colours), the players dealt again with the seed. */
export function reshuffleTeams(teams: readonly TeamInfo[], seed: number): TeamInfo[] {
  const ids = teams.flatMap((t) => t.playerIds);
  if (ids.length < teams.length) return [...teams]; // not enough players to deal
  const split = balanceTeams(ids, teams.length, seed);
  return withPlayers(teams, (t) => split[teams.indexOf(t)]!);
}

// --- A chef drops (design §1 "Si un jugador se cae") ---------------------------------------------------------------
// Today (before F2) a dropped phone leaves its chef standing, and after SLOT_GRACE_MS the chef is deleted with whatever it held.
// The policy: the chef turns into a ghost for GHOST_MS (the sim also drops what it carries on the nearest free counter);
// back in time = same team and chef; later, k is recomputed from that instant and the player comes back as a spectator.
// A team left without anybody pauses the match: "Seguir sin ganador" or "Terminar".

export interface RosterEntry { id: number; teamId: TeamId; droppedAt: number | null; assist?: true } // droppedAt: match time (ms) when the phone dropped, null while connected; assist: the chef plays on Ayudante (absent otherwise)

/** Does the chef still hold its place at `now`? True while connected and during the grace window (the boundary counts as in time). */
export const holdsPlace = (e: RosterEntry, now: number, graceMs = GHOST_MS): boolean => e.droppedAt === null || now - e.droppedAt <= graceMs;

export interface MatchStatus { counts: number[]; k: number[]; emptyTeams: TeamId[]; paused: boolean }
/**
 * Active chefs per team at `now` (in the order of `teamIds`), the multiplier each team gets from this instant and whether the
 * match must pause. k is applied even for a lopsided result (a 3v1 after drops is not refused: the start check already
 * passed), and stays 1 while paused or when the mode has no score-k handicap.
 */
export function matchStatus(teamIds: readonly TeamId[], roster: readonly RosterEntry[], now: number, handicap: TeamSpec['handicap'], graceMs = GHOST_MS): MatchStatus {
  const counts = teamIds.map((t) => roster.filter((e) => e.teamId === t && holdsPlace(e, now, graceMs)).length);
  const emptyTeams = teamIds.filter((_t, i) => counts[i] === 0);
  const paused = emptyTeams.length > 0;
  const assists = teamIds.map((t) => roster.filter((e) => e.teamId === t && e.assist && holdsPlace(e, now, graceMs)).length);
  const k = !paused && handicap === 'score-k' ? teamMultipliers(counts, Infinity, assists)! : counts.map(() => 1);
  return { counts, k, emptyTeams, paused };
}

export type PauseChoice = 'continue' | 'end';
/** What the host picks when a team is empty: keep playing with no winner, or finish now. */
export const pauseOutcome = (c: PauseChoice): { endsMatch: boolean; winner: boolean } => (c === 'end' ? { endsMatch: true, winner: false } : { endsMatch: false, winner: false });

// --- Ranking (design §1 "Desempate") --------------------------------------------------------------------------------

export interface TeamResult { teamId: TeamId; score: number; delivered: number; vip: number; reachedAt: number } // score already times k; reachedAt: match time of the last point
/** Highest first: score with k, deliveries, VIPs won, whoever reached the final score earlier. */
export const compareTeams = (a: TeamResult, b: TeamResult): number => b.score - a.score || b.delivered - a.delivered || b.vip - a.vip || a.reachedAt - b.reachedAt;
/** The results sorted, and the winner (null when the two best are still equal after every rule: a draw). */
export function rankTeams(results: readonly TeamResult[]): { order: TeamResult[]; winner: TeamId | null } {
  const order = [...results].sort(compareTeams);
  const draw = order.length > 1 && compareTeams(order[0]!, order[1]!) === 0;
  return { order, winner: order.length && !draw ? order[0]!.teamId : null };
}
