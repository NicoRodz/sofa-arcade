// What the Versus screens show, as plain data (design pizzas-modalidades-coop-versus §3 "HUD" and "Resultados"): the verdict of a round,
// the numbers of each team, its MVP, the series of the session, the hidden scoreboard and the lead changes. Pure: no clock, no I/O, no DOM.
import type { Emitter, GameEvents } from '@pichi/core/events';
import type { Game, Recipe } from '../overcooked';
import { summarizeTeam, type TeamSummary } from '../results';
import { compareTeams, type TeamId, type TeamInfo, type TeamResult } from '@pichi/core/lobby/teams';

// --- Who won, and why ------------------------------------------------------------------------------------------------------------------

/** win: a team won. draw: every rule left a tie. nowinner: the host went on after a team emptied. aborted: the host ended it from the pause. */
export type Verdict = 'win' | 'draw' | 'nowinner' | 'aborted';
/** The rule that told the two best teams apart (design "Desempate"): the score, or one of the tie-breaks. */
export type DecidedBy = 'score' | 'delivered' | 'vip' | 'reachedAt';

/** Which rule separated the best team from the second one. Null when there is a single team or they tie on every rule. */
export function decidedBy(order: readonly TeamResult[]): DecidedBy | null {
  const [a, b] = order;
  if (!a || !b || compareTeams(a, b) === 0) return null;
  if (a.score !== b.score) return 'score';
  if (a.delivered !== b.delivered) return 'delivered';
  if (a.vip !== b.vip) return 'vip';
  return 'reachedAt';
}

export const DECIDED_TEXT: Record<DecidedBy, string> = {
  score: '',
  delivered: 'Mismo puntaje: desempató quien entregó más pedidos',
  vip: 'Mismo puntaje y entregas: desempató el pedido dorado',
  reachedAt: 'Todo igual: ganó quien llegó antes a ese puntaje',
};

export function verdictOf(g: Pick<Game, 'result' | 'noWinner'>): Verdict {
  const r = g.result;
  if (r?.aborted) return 'aborted';
  if (g.noWinner) return 'nowinner';
  return r && r.winner !== null ? 'win' : 'draw';
}

// --- MVP (the chef with most deliveries of each team) -----------------------------------------------------------------------------------

/** Deliveries per chef, counted from the bus (the sim keeps them per team, not per chef). `off` stops listening. */
export function tallyDeliveries(bus: Emitter<GameEvents>): { counts: Map<number, number>; reset(): void; off(): void } {
  const counts = new Map<number, number>();
  const off = bus.on('delivered', (e) => counts.set(e.player, (counts.get(e.player) ?? 0) + 1));
  return { counts, reset: () => counts.clear(), off };
}

export interface Mvp {
  playerId: number;
  delivered: number;
}
/** The chef of `playerIds` with the most deliveries; on a tie the first one listed (the lowest id the lobby dealt). Null when nobody delivered. */
export function mvpOf(playerIds: readonly number[], delivered: ReadonlyMap<number, number>): Mvp | null {
  let best: Mvp | null = null;
  for (const id of playerIds) {
    const n = delivered.get(id) ?? 0;
    if (n > 0 && (!best || n > best.delivered)) best = { playerId: id, delivered: n };
  }
  return best;
}

// --- The round's report -------------------------------------------------------------------------------------------------------------------

export interface TeamReport extends TeamSummary {
  name: string;
  icon: string;
  color: string;
  rank: number; // 1 = best; teams that tie on every rule share the rank
  winner: boolean;
  mvp: Mvp | null;
}
export interface VersusReport {
  verdict: Verdict;
  winner: TeamId | null;
  decidedBy: DecidedBy | null;
  margin: number;
  teams: TeamReport[];
  ranked: TeamId[];
}

/**
 * Everything the results screen needs, from the finished game and the frozen teams. `teams` are the lobby's (names, colours, chefs);
 * `delivered` is the per-chef tally (tallyDeliveries). Teams come in id order; `ranked` is the order of the podium.
 */
export function versusReport(
  g: Game,
  teams: readonly Pick<TeamInfo, 'name' | 'icon' | 'color' | 'playerIds'>[],
  delivered: ReadonlyMap<number, number>,
): VersusReport {
  const res = g.result;
  const order = res?.order ?? [];
  const verdict = verdictOf(g);
  const winner = verdict === 'win' ? res!.winner : null;
  const rows = g.teams.map((t): TeamReport => {
    const info = teams[t.id];
    const at = order.findIndex((o) => o.teamId === t.id);
    const rank = 1 + order.filter((o) => compareTeams(o, order[at]!) < 0).length; // the teams strictly ahead of it, plus one
    return {
      ...summarizeTeam(g, t.id),
      name: info?.name ?? `Equipo ${t.id + 1}`,
      icon: info?.icon ?? '',
      color: info?.color ?? '#888888',
      rank,
      winner: t.id === winner,
      mvp: mvpOf(info?.playerIds ?? [], delivered),
    };
  });
  const margin = order.length > 1 ? order[0]!.score - order[1]!.score : 0;
  return {
    verdict,
    winner,
    decidedBy: verdict === 'win' ? decidedBy(order) : null,
    margin,
    teams: rows,
    ranked: order.map((o) => o.teamId),
  };
}

// --- What a phone is told at the end ------------------------------------------------------------------------------------------------------

/** The result a phone gets with the phase 'results': the verdict, the winner and every team's final score (the phone picks its own from `you`). */
export interface PhoneResult {
  verdict: Verdict;
  winner: number | null;
  scores: { team: number; score: number }[];
}
export const phoneResult = (r: Pick<VersusReport, 'verdict' | 'winner' | 'teams'>): PhoneResult => ({
  verdict: r.verdict,
  winner: r.winner,
  scores: r.teams.map((t) => ({ team: t.teamId, score: t.score })),
});

export type Outcome = 'won' | 'lost' | 'draw' | 'none';
/** How the round ended for the team of this phone. 'none': no winner was decided (the host ended it, or a team emptied) or the phone is on no team. */
export function outcomeFor(r: PhoneResult, myTeam: number | null): Outcome {
  if (myTeam === null || r.verdict === 'aborted' || r.verdict === 'nowinner') return 'none';
  if (r.verdict === 'draw') return 'draw';
  return r.winner === myTeam ? 'won' : 'lost';
}

// --- The series of the session ------------------------------------------------------------------------------------------------------------

export interface Series {
  key: string;
  wins: number[];
  draws: number;
}
/** The identity of a series: the chefs that play. A rematch, or the same chefs on swapped teams, goes on with it; a different group starts over. */
export const seriesKey = (teams: readonly Pick<TeamInfo, 'playerIds'>[]): string =>
  teams
    .flatMap((t) => t.playerIds)
    .sort((a, b) => a - b)
    .join(',');

/** The series after a finished round (a round with no winner by choice of the host does not count). Starts a new one when the group changed. */
export function recordRound(
  prev: Series | null,
  teams: readonly Pick<TeamInfo, 'playerIds'>[],
  verdict: Verdict,
  winner: TeamId | null,
): Series {
  const key = seriesKey(teams);
  const s: Series =
    prev && prev.key === key ? { key, wins: [...prev.wins], draws: prev.draws } : { key, wins: teams.map(() => 0), draws: 0 };
  if (verdict === 'win' && winner !== null) s.wins[winner] = (s.wins[winner] ?? 0) + 1;
  else if (verdict === 'draw') s.draws++;
  return s;
}
export const seriesRounds = (s: Series): number => s.wins.reduce((a, b) => a + b, 0) + s.draws;
/** "Picantes 2–1 Frescos" (+ "· 1 empate"); null before the first round. */
export function seriesLine(s: Series | null, names: readonly string[]): string | null {
  if (!s || seriesRounds(s) === 0) return null;
  const head =
    names.length === 2 ? `${names[0]} ${s.wins[0]}–${s.wins[1]} ${names[1]}` : names.map((n, i) => `${n} ${s.wins[i]}`).join(' · ');
  return s.draws ? `${head} · ${s.draws} ${s.draws === 1 ? 'empate' : 'empates'}` : head;
}

// --- Scoreboard ---------------------------------------------------------------------------------------------------------------------------

export const HIDE_SCORE_MS = 20_000; // versus: the scoreboard shows ??? this long before the end (the results reveal it)
/** Is the scoreboard hidden now? Only while the clock runs, in the last HIDE_SCORE_MS, and only when the host kept the option on. */
export const scoreHidden = (opt: boolean, running: boolean, leftMs: number): boolean => opt && running && leftMs <= HIDE_SCORE_MS;

/** A team's handicap as the HUD writes it: "×1,22" (Spanish decimal comma), empty at 1. */
export const kText = (k: number): string => (k > 1 ? `×${String(k).replace('.', ',')}` : '');

export interface LeadState {
  leader: TeamId | null;
} // the team that last led ALONE (a tie keeps it: whoever takes the lead after it is overtaking)
export const NO_LEAD: LeadState = { leader: null };
/**
 * The lead after the scores changed. A team that takes the lead from the one that last led is a comeback ("remontada"); the first points of
 * the match, a tie, or the same team regaining its own lead are not. While the scoreboard is hidden nothing changes and nothing is
 * reported, so the sound never gives the lead away.
 */
export function nextLead(prev: LeadState, scores: readonly number[], hidden: boolean): { state: LeadState; cue: 'comeback' | null } {
  if (hidden) return { state: prev, cue: null };
  const top = Math.max(...scores);
  const alone = scores.filter((s) => s === top).length === 1 && top > 0;
  if (!alone) return { state: prev, cue: null };
  const leader = scores.indexOf(top);
  if (leader === prev.leader) return { state: prev, cue: null };
  return { state: { leader }, cue: prev.leader !== null ? 'comeback' : null };
}

// --- The golden order card ----------------------------------------------------------------------------------------------------------------

export interface VipView {
  recipe: Recipe;
  leftMs: number;
  fraction: number;
}
/** The golden order while somebody can still win it: its recipe and the patience left (the longest of the queues, they share the same 30 s). Null otherwise. */
export function vipView(g: Pick<Game, 'teams' | 'time' | 'vip'>, ttlMs: number): VipView | null {
  const r = g.vip.round;
  if (!r) return null;
  const left = Math.max(0, ...g.teams.flatMap((t) => t.orders.filter((o) => o.vip).map((o) => o.expiresAt - g.time)));
  return left > 0 ? { recipe: r.recipe, leftMs: left, fraction: Math.min(1, left / ttlMs) } : null;
}
