// Voting engine for the phone menus (design menus-desde-celular-votacion, section 2). PURE: immutable state, the clock and the RNG are
// injected, no network, no UI. Every function returns a new object; an ignored action only moves lastTickAt (votes, closing, status and result stay equal).
//
// PUBLIC API (F2 wires it to `menu.state`, F3 to the registry)
//   Roster (who may vote):  makeRoster(ids, now, captainId?) addPlayer removePlayer setConnected touch tickAfk setCaptain
//                           eligible(roster) -> E list, majorityOf(E) -> M = floor(E/2)+1, recordParticipation(roster, closedVote)
//   Vote lifecycle:         openVote(cfg, now) -> VoteState (status 'open')
//                           cast(v, ctx, player, voteId, option|null)   same option again, or null, withdraws the vote
//                           tick(v, ctx)           call on a timer (10 Hz) AND right after any roster change; idempotent
//                           captainGo(v, ctx, by) / captainCancel(v, ctx, by)   the Captain's "Ya!" and its cancellation
//                           keyboardPick(v, ctx, option)  keyboard has the last word: closes at once ("Teclado eligio X")
//                           settle(v, ctx)         closes now with the live leader (the lobby "Listo"); cancel(v) -> status 'cancelled'
//                           clearVotes(v, now)     parent item changed: its dependents lose their votes (see dependentKeys)
//   Read:                   snapshot(v, ctx) -> counts, voters, leader, E, M, remainingMs, closing; v.result once status 'closed'
//   Registry type:          OptionSpec below (declared here, the registry in games.ts adopts it in F3)
// ctx = { now, rng, roster }. `now` is any monotonic ms number (a fake clock in tests). Call tick BEFORE and after mutating the roster
// so elapsed time is billed with the old E. A phone input of any kind must call touch(roster, id, now) first (it reactivates an AFK
// player); cast() itself rejects ineligible players (spectators, disconnected, AFK).
// Result: v.result = { winner, reason, via, counts, roulette? }. The roulette (1.5 s) is only an animation of an already drawn winner.
//
// Decisions on ambiguities (simplest reading):
//  - kinds: 'pick' (game / results: plurality, tie -> roulette), 'destructive' (needs >=M votes, else statu quo `current`),
//    'item' (lobby: no clock, no early close, live leader, tie or no votes -> `current`; closed by settle()).
//  - the 1.5 s grace applies to "everyone voted", "option reached M" and the Captain's "Ya!"; a closing is re-evaluated on every tick.
//  - "Ya!" needs >=1 counted vote (else ignored) and cfg.captainMinMs (4 s) since the vote opened.
//  - with E=0 the clock freezes (it does not reset) and any closing is cancelled; if the only voter withdraws, the clock resets.
//  - deadline with no counted vote: winner = cfg.current ?? null, via 'empty'.
import type { IconId } from './icons';
import type { Rng } from './rng';

export type PlayerId = number;
export type OptionId = string;

export const AFK_IDLE_MS = 90_000;
export const AFK_MISSED_VOTES = 2;
export const GAME_WINDOW_MS = 15_000;
export const RESULTS_WINDOW_MS = 12_000;
export const PAUSE_WINDOW_MS = 15_000;
export const GRACE_MS = 1_500;
export const ROULETTE_MS = 1_500;
export const CAPTAIN_MIN_MS = 4_000;
export const CAST_COOLDOWN_MS = 250;

// ---- registry schema (per-game votable options) ----------------------------------------------------------------------------------
export interface OptionValue {
  id: string;
  label: string;
  icon?: IconId;
}
export interface OptionSpec {
  key: string;
  label: string;
  type: 'enum' | 'seed'; // seed is voted as "Aleatorio / Repetir / 3 sugeridas": the screen fills `values`
  values: readonly OptionValue[];
  default: string; // value id
  votable: boolean;
  parent?: string; // key of the option this one depends on: changing the parent resets this one's votes
  visibleIf?: (current: Readonly<Record<string, string>>) => boolean; // e.g. teams only if mode is versus; evaluated on the screen
  availableFor?: (nPlayers: number) => boolean; // evaluated on the screen
}
/** Keys that depend (transitively) on `key`: their votes must be cleared when `key` changes. */
export function dependentKeys(specs: readonly OptionSpec[], key: string): string[] {
  const out: string[] = [];
  const walk = (k: string) => {
    for (const s of specs)
      if (s.parent === k && !out.includes(s.key)) {
        out.push(s.key);
        walk(s.key);
      }
  };
  walk(key);
  return out;
}

// ---- roster -----------------------------------------------------------------------------------------------------------------------
export interface Presence {
  readonly connected: boolean;
  readonly afk: boolean;
  readonly lastInputAt: number;
  readonly missed: number;
}
export interface Roster {
  readonly players: Readonly<Record<PlayerId, Presence>>;
  readonly captainId: PlayerId | null;
}

const freshPresence = (now: number): Presence => ({ connected: true, afk: false, lastInputAt: now, missed: 0 });
const patch = (r: Roster, id: PlayerId, p: Partial<Presence>): Roster => {
  const cur = r.players[id];
  return cur ? { ...r, players: { ...r.players, [id]: { ...cur, ...p } } } : r;
};

export function makeRoster(ids: readonly PlayerId[], now: number, captainId: PlayerId | null = ids[0] ?? null): Roster {
  return { players: Object.fromEntries(ids.map((id) => [id, freshPresence(now)])), captainId };
}
/** A player sitting down (also mid-vote: it counts in E at once). */
export const addPlayer = (r: Roster, id: PlayerId, now: number): Roster =>
  r.players[id] ? setConnected(r, id, true, now) : { ...r, players: { ...r.players, [id]: freshPresence(now) } };
export function removePlayer(r: Roster, id: PlayerId): Roster {
  const { [id]: _gone, ...rest } = r.players;
  return { players: rest, captainId: r.captainId === id ? null : r.captainId };
}
/** Disconnect leaves E at once; reconnecting is an input (reactivates). Their vote stays suspended in the vote state. */
export const setConnected = (r: Roster, id: PlayerId, connected: boolean, now: number): Roster =>
  connected ? patch(r, id, { connected: true, afk: false, lastInputAt: now }) : patch(r, id, { connected: false });
/** Any input from the phone: reactivates an AFK player. */
export function touch(r: Roster, id: PlayerId, now: number): Roster {
  const p = r.players[id];
  if (!p) return r;
  return patch(r, id, { lastInputAt: now, afk: false, missed: p.afk ? 0 : p.missed });
}
export function tickAfk(r: Roster, now: number): Roster {
  let out = r;
  for (const [k, p] of Object.entries(r.players))
    if (p.connected && !p.afk && now - p.lastInputAt >= AFK_IDLE_MS) out = patch(out, Number(k), { afk: true });
  return out;
}
export const setCaptain = (r: Roster, id: PlayerId | null): Roster => ({ ...r, captainId: id });
export const eligible = (r: Roster): PlayerId[] =>
  Object.keys(r.players)
    .map(Number)
    .filter((id) => {
      const p = r.players[id]!;
      return p.connected && !p.afk;
    })
    .sort((a, b) => a - b);
export const majorityOf = (e: number): number => Math.floor(e / 2) + 1;

/** After a pick/destructive vote closed: eligible players who did not vote miss one; two in a row make them AFK. Voters reset. */
export function recordParticipation(r: Roster, v: VoteState): Roster {
  if (v.status !== 'closed') return r;
  let out = r;
  for (const id of eligible(r)) {
    const missed = v.votes[id] === undefined ? r.players[id]!.missed + 1 : 0;
    out = patch(out, id, missed >= AFK_MISSED_VOTES ? { missed, afk: true } : { missed });
  }
  return out;
}

// ---- vote -------------------------------------------------------------------------------------------------------------------------
export type VoteKind = 'pick' | 'destructive' | 'item';
export interface VoteConfig {
  voteId: string | number;
  kind: VoteKind;
  options: readonly OptionId[];
  current?: OptionId; // statu quo; required for 'destructive' and 'item' (the current value / "continue")
  windowMs: number | null; // starts at the FIRST vote; null = no clock (lobby)
  graceMs?: number;
  captainMinMs?: number;
  castCooldownMs?: number;
}
export type CloseReason = 'all' | 'majority' | 'deadline' | 'captain' | 'keyboard' | 'settle';
export interface Closing {
  reason: 'all' | 'majority' | 'captain';
  option?: OptionId;
  closesAt: number;
} // option only for 'majority'
export interface VoteResult {
  winner: OptionId | null;
  reason: CloseReason;
  via: 'plurality' | 'roulette' | 'majority' | 'statu-quo' | 'keyboard' | 'empty';
  counts: Readonly<Record<OptionId, number>>;
  roulette?: { candidates: OptionId[]; ms: number };
}
export interface VoteState {
  readonly cfg: VoteConfig;
  readonly status: 'open' | 'closed' | 'cancelled';
  readonly openedAt: number;
  readonly votes: Readonly<Record<PlayerId, OptionId>>; // by playerId (token), kept while the player is away
  readonly lastCastAt: Readonly<Record<PlayerId, number>>;
  readonly remainingMs: number | null;
  readonly lastTickAt: number;
  readonly running: boolean;
  readonly closing: Closing | null;
  readonly result: VoteResult | null;
}
export interface Ctx {
  now: number;
  rng: Rng;
  roster: Roster;
}

export function openVote(cfg: VoteConfig, now: number): VoteState {
  if (cfg.options.length < 1) throw new Error('vote needs options');
  if (cfg.kind !== 'pick' && (cfg.current === undefined || !cfg.options.includes(cfg.current)))
    throw new Error(`${cfg.kind} vote needs a current option`);
  return {
    cfg,
    status: 'open',
    openedAt: now,
    votes: {},
    lastCastAt: {},
    remainingMs: cfg.windowMs,
    lastTickAt: now,
    running: false,
    closing: null,
    result: null,
  };
}

/** Counted voters per option: only eligible players count; a disconnected/AFK player's vote is suspended, not lost. */
function tally(v: VoteState, roster: Roster) {
  const voters: Record<OptionId, PlayerId[]> = Object.fromEntries(v.cfg.options.map((o) => [o, [] as PlayerId[]]));
  const el = eligible(roster);
  let voted = 0;
  for (const id of el) {
    const o = v.votes[id];
    if (o !== undefined && voters[o]) {
      voters[o].push(id);
      voted++;
    }
  }
  const counts: Record<OptionId, number> = Object.fromEntries(v.cfg.options.map((o) => [o, voters[o]!.length]));
  return { voters, counts, voted, E: el.length, M: majorityOf(el.length) };
}

function leaders(v: VoteState, counts: Readonly<Record<OptionId, number>>): OptionId[] {
  const max = Math.max(0, ...v.cfg.options.map((o) => counts[o]!));
  return max > 0 ? v.cfg.options.filter((o) => counts[o] === max) : [];
}

function resolve(v: VoteState, ctx: Ctx, reason: CloseReason): VoteResult {
  const { counts, voted, M } = tally(v, ctx.roster);
  const { cfg } = v;
  const base = { reason, counts };
  if (voted === 0) return { ...base, winner: cfg.current ?? null, via: 'empty' };
  if (cfg.kind === 'destructive') {
    const win = cfg.options.find((o) => counts[o]! >= M);
    return win !== undefined ? { ...base, winner: win, via: 'majority' } : { ...base, winner: cfg.current!, via: 'statu-quo' };
  }
  const top = leaders(v, counts);
  if (top.length === 1) return { ...base, winner: top[0]!, via: 'plurality' };
  if (cfg.kind === 'item') return { ...base, winner: cfg.current!, via: 'statu-quo' };
  const winner = top[Math.floor(ctx.rng() * top.length)]!; // pick: tie -> roulette among the tied options, seeded by the screen
  return { ...base, winner, via: 'roulette', roulette: { candidates: top, ms: ROULETTE_MS } };
}

const closeWith = (v: VoteState, ctx: Ctx, reason: CloseReason): VoteState => ({
  ...v,
  status: 'closed',
  running: false,
  closing: null,
  result: resolve(v, ctx, reason),
});

/** The closing the current votes ask for (null = none). Item votes never close by themselves. */
function wantedClosing(v: VoteState, ctx: Ctx): { reason: 'all' | 'majority'; option?: OptionId } | null {
  if (v.cfg.kind === 'item') return null;
  const { counts, voted, E, M } = tally(v, ctx.roster);
  if (E === 0) return null;
  const hit = v.cfg.options.find((o) => counts[o]! >= M);
  if (hit !== undefined) return { reason: 'majority', option: hit };
  return voted === E ? { reason: 'all' } : null;
}

export function tick(v: VoteState, ctx: Ctx): VoteState {
  if (v.status !== 'open') return v;
  const { now, roster } = ctx;
  const wasRunning = v.running;
  // 1. clock: elapsed time is billed only if it was running at the previous tick
  let remainingMs = v.remainingMs;
  if (wasRunning && remainingMs !== null) remainingMs = Math.max(0, remainingMs - Math.max(0, now - v.lastTickAt));
  // 2. the clock starts with the first vote, freezes with E=0 and resets when the last vote is withdrawn
  const hasVotes = Object.keys(v.votes).length > 0;
  if (v.cfg.windowMs !== null && !hasVotes) remainingMs = v.cfg.windowMs;
  const running = v.cfg.windowMs !== null && hasVotes && eligible(roster).length > 0;
  let s: VoteState = { ...v, remainingMs, running, lastTickAt: now };
  // 3. closing: the Captain's one is kept (until E=0 or cancelled); the others follow the votes, and are cancelled if they stop holding
  const grace = v.cfg.graceMs ?? GRACE_MS;
  if (eligible(roster).length === 0) s = { ...s, closing: null };
  else if (s.closing?.reason !== 'captain') {
    const want = wantedClosing(s, ctx);
    if (!want) s = { ...s, closing: null };
    else if (s.closing?.reason !== want.reason || s.closing.option !== want.option)
      s = { ...s, closing: { ...want, closesAt: now + grace } };
  }
  // 4. close
  if (s.closing && now >= s.closing.closesAt) return closeWith(s, ctx, s.closing.reason);
  if (wasRunning && remainingMs !== null && remainingMs <= 0) return closeWith(s, ctx, 'deadline');
  return s;
}

export function cast(v: VoteState, ctx: Ctx, player: PlayerId, voteId: string | number, option: OptionId | null): VoteState {
  const s = tick(v, ctx);
  if (s.status !== 'open' || voteId !== s.cfg.voteId) return s;
  if (!eligible(ctx.roster).includes(player)) return s;
  if (option !== null && !s.cfg.options.includes(option)) return s;
  const last = s.lastCastAt[player];
  if (last !== undefined && ctx.now - last < (s.cfg.castCooldownMs ?? CAST_COOLDOWN_MS)) return s;
  const mine = s.votes[player];
  const withdraw = option === null || option === mine;
  if (withdraw && mine === undefined) return s;
  const votes = { ...s.votes };
  if (withdraw) delete votes[player];
  else votes[player] = option!;
  return tick({ ...s, votes, lastCastAt: { ...s.lastCastAt, [player]: ctx.now } }, ctx);
}

/** The Captain's "Ya!": closes with the current leader after the grace. Ignored before captainMinMs, with no votes, or from anyone else. */
export function captainGo(v: VoteState, ctx: Ctx, by: PlayerId): VoteState {
  const s = tick(v, ctx);
  if (s.status !== 'open' || s.cfg.kind === 'item' || by !== ctx.roster.captainId || !eligible(ctx.roster).includes(by)) return s;
  if (ctx.now - s.openedAt < (s.cfg.captainMinMs ?? CAPTAIN_MIN_MS) || tally(s, ctx.roster).voted === 0 || s.closing?.reason === 'captain')
    return s;
  return { ...s, closing: { reason: 'captain', closesAt: ctx.now + (s.cfg.graceMs ?? GRACE_MS) } };
}
export function captainCancel(v: VoteState, ctx: Ctx, by: PlayerId): VoteState {
  const s = tick(v, ctx);
  if (s.status !== 'open' || s.closing?.reason !== 'captain' || by !== ctx.roster.captainId) return s;
  return tick({ ...s, closing: null }, ctx);
}

/** Keyboard (the physical host) has the last word: closes at once with the chosen option. */
export function keyboardPick(v: VoteState, ctx: Ctx, option: OptionId): VoteState {
  if (v.status !== 'open' || !v.cfg.options.includes(option)) return v;
  const { counts } = tally(v, ctx.roster);
  return { ...v, status: 'closed', running: false, closing: null, result: { winner: option, reason: 'keyboard', via: 'keyboard', counts } };
}
/** Closes now with the live leader (lobby item at "Listo"). */
export const settle = (v: VoteState, ctx: Ctx): VoteState => {
  const s = tick(v, ctx);
  return s.status === 'open' ? closeWith(s, ctx, 'settle') : s;
};
export const cancel = (v: VoteState): VoteState => (v.status === 'open' ? { ...v, status: 'cancelled', running: false, closing: null } : v);
/** Parent item changed: drop the votes (and the clock) of a dependent item. */
export const clearVotes = (v: VoteState, now: number): VoteState =>
  v.status !== 'open'
    ? v
    : { ...v, votes: {}, lastCastAt: {}, remainingMs: v.cfg.windowMs, lastTickAt: now, running: false, closing: null };

export interface VoteSnapshot {
  voteId: string | number;
  kind: VoteKind;
  status: VoteState['status'];
  counts: Readonly<Record<OptionId, number>>;
  voters: Readonly<Record<OptionId, readonly PlayerId[]>>;
  E: number;
  M: number;
  voted: number;
  waiting: PlayerId[]; // waiting: eligible who have not voted ("faltan: ...")
  leader: OptionId | null; // live: the option shown on the TV (item: tie or no votes -> current)
  tie: boolean;
  remainingMs: number | null;
  running: boolean;
  closing: { reason: Closing['reason']; option?: OptionId; inMs: number } | null;
  result: VoteResult | null;
}
export function snapshot(v: VoteState, ctx: Ctx): VoteSnapshot {
  const t = tally(v, ctx.roster);
  const top = leaders(v, t.counts);
  const live = v.running && v.remainingMs !== null ? Math.max(0, v.remainingMs - Math.max(0, ctx.now - v.lastTickAt)) : v.remainingMs;
  return {
    voteId: v.cfg.voteId,
    kind: v.cfg.kind,
    status: v.status,
    counts: t.counts,
    voters: t.voters,
    E: t.E,
    M: t.M,
    voted: t.voted,
    waiting: eligible(ctx.roster).filter((id) => v.votes[id] === undefined),
    leader: top.length === 1 ? top[0]! : (v.cfg.current ?? null),
    tie: top.length > 1,
    remainingMs: live,
    running: v.running,
    closing: v.closing ? { reason: v.closing.reason, option: v.closing.option, inMs: Math.max(0, v.closing.closesAt - ctx.now) } : null,
    result: v.result,
  };
}
