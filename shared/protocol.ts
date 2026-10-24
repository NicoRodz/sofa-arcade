import { DEFAULT_DIFFICULTY, isDifficulty, type Difficulty } from './difficulty';
import { DEFAULT_GAME, DEFAULT_MODE, GAMES, LABEL_MAX, gameInfo, isGameId, isModeId, resolveModes, type GameId, type GameInfo, type ModeId } from './games';
import { DEFAULT_MAP, isMapChoice, type MapChoice } from './maps';
import { isIconId, type IconId } from './icons';
import { PUESTO_IDS, isPuestoId, type PuestoId } from './puestos';
import { MAX_TEAMS, teamOf, type TeamInfo } from './teams';
import { isNavKey, type NavKey } from './captain';
import { isVersusChoice, type VersusChoice } from './versusMaps';
import { SIGNAL_KINDS, type SignalKind } from './games/obstaculos/sim/campaign';
import type { PhoneResult, Verdict } from './versusReport';

export { ROUND_MS } from './difficulty';
export type { SignalKind } from './games/obstaculos/sim/campaign';
export { MAX_TEAMS, type TeamInfo } from './teams';
export { KEYBOARD_QUIET_MS, NAV_KEYS, NAV_TO_KEY, acceptNav, captainOf, isNavKey, navToKey, remoteBlocked, remoteVisible, type NavKey } from './captain';

// 2: teams (modeId, teams and teamsLocked in the lobby config, teamId per player, 'setTeam' and 'you'). A v1 screen or phone never sends
// those fields and is read as cooperative with no teams assigned.
// 3: the Captain ('captain' to everyone, 'nav' from the Captain's phone to the screens, stamped with 'from'). Additive: an older screen or phone ignores both.
// 4: the versus result ('phase' results carries `result`: verdict, winner and every team's score). Additive: an older phone ignores it.
// 5: Ayudante ('assist' from a phone, and to the screens and that phone; PublicPlayer.assist). Additive: an older screen never reads it, an older phone never sends it.
// 6: Cocina escuela (phase 'school'; 'school' from the screen to one phone: its step and instruction; 'schoolDone' from a phone: it already did the school, or skips it; PublicPlayer.school). Additive:
// an older phone shows its normal pad in that phase and an older screen never enters it.
export const PROTOCOL_VERSION = 6;
export const WS_PATH = '/ws';
export const DEFAULT_ROOM = 'main';
export const INPUT_HZ = 30;
export const PING_MS = 1000;
export const DEADZONE = 0.15;
export const MAX_PLAYERS = 8;
export const BUTTON_COUNT = 2; // btn bitmask: bit 0 = A, bit 1 = B
export const SLOT_GRACE_MS = 60_000; // a dropped phone keeps its slot this long
export const ROOM_CODE_LEN = 4;
export const PRESS_MOD = 65536;
// Chef palette (red, blue, green, yellow, purple, orange, pink, teal); the screen's chef specs use the same list.
export const COLORS = ['#E63B2E', '#2F7DE1', '#3FA34D', '#FFC21A', '#8E5CD9', '#FF7A1A', '#FF5FA2', '#1FB5A8'];

// x right+, y down+, both in [-1, 1]. btn is a bitmask (state); presses are monotonic counters (mod PRESS_MOD).
export interface InputState {
  seq: number;
  x: number;
  y: number;
  btn: number;
  presses: number[];
  ts: number; // sender Date.now()
  // Campaign signals of "Obstaculos en cadena" (plan §4 #1). Additive: a phone that never sends them is read as before. `sig` is a monotonic counter
  // like the presses (a new seq = one signal of that kind; the first sample is the baseline), `go` is a state (holding "¡ya!" starts the 3-2-1).
  sig?: { kind: SignalKind; seq: number };
  go?: boolean;
}

// menu: the Pichiclub start screen, where the screen picks the game (phones wait). lobby: that game's setup.
export const PHASES = ['menu', 'lobby', 'school', 'playing', 'results'] as const; // school: the guided practice round (shared/tutorial), between the lobby and the first match
export type Phase = (typeof PHASES)[number];
export interface Score { id: number; score: number }
// Suggested stations for the round (see puestos.ts): the screen assigns them, the phones show them. Never enforced.
export interface PuestoAssign { id: number; puestos: PuestoId[]; pool: PuestoId[] } // pool: what "Cambiar" cycles through
export interface PuestoMsg { cheese: boolean; sink: boolean; assign: PuestoAssign[] }
// How a round starts (sent with phase 'playing'): the lobby choices frozen. modeOptions is opaque here: each game types its own.
export type ModeOptions = Record<string, boolean | number | string>;
export interface MatchStart { gameId: GameId; modeId: ModeId; mapId: string; difficulty: Difficulty; teams: TeamInfo[] | null; modeOptions: ModeOptions }
export interface PhaseInfo { phase: Phase; scores?: Score[]; puestos?: PuestoMsg; match?: MatchStart; result?: PhoneResult } // result: versus only, with phase 'results'

// What A and B say on one phone right now, sent with the state of every sim tick (not as an event: a late packet is simply replaced by the next).
// a / b: the label (null: the game's own). aIcon / bIcon: the glyph the button wears (absent: the game's own). aOff / bOff: nothing to do now, the button greys out.
export interface HintLabels { a: string | null; b: string | null; aIcon?: IconId; bIcon?: IconId; aOff?: boolean; bOff?: boolean }
/** The optional fields of a hint, copied only when set (the relay forwards exactly these, nothing else from the payload). */
export const hintExtras = (h: HintLabels): Omit<HintLabels, 'a' | 'b'> => ({ ...(h.aIcon ? { aIcon: h.aIcon } : {}), ...(h.bIcon ? { bIcon: h.bIcon } : {}), ...(h.aOff ? { aOff: true } : {}), ...(h.bOff ? { bOff: true } : {}) });

// R7: a short vibration on one phone (Android); iOS has no vibration API, so the phone flashes its colour instead.
// The screen decides when (it owns the game events); the phone only plays the pattern, in ms on / off / on...
export const BUZZ_PATTERNS = { pick: [20], chop: [40], bad: [30, 40, 30], dash: [15], slip: [120] } as const satisfies Record<string, readonly number[]>;
export type BuzzKind = keyof typeof BUZZ_PATTERNS;
export const isBuzzKind = (v: unknown): v is BuzzKind => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BUZZ_PATTERNS, v);

// What the lobby has chosen; the screen owns it and the relay forwards it to the phones.
export const SEED_MAX = 2 ** 32;
export const isSeed = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < SEED_MAX;
// modeId + teams + teamsLocked: the lobby's mode and its teams (null until assigned; the screen owns them, the relay derives each phone's team from them).
export interface LobbyConfig { game: GameId; difficulty: Difficulty; map: MapChoice | VersusChoice; seed: number; modeId: ModeId; teams: TeamInfo[] | null; teamsLocked: boolean; modeOptions: ModeOptions }
// What a screen may send: a v1 screen leaves the team fields out and the parser fills the defaults (cooperative, no teams).
type ConfigFromScreen = Omit<LobbyConfig, 'modeId' | 'teams' | 'teamsLocked' | 'modeOptions'> & Partial<Pick<LobbyConfig, 'modeId' | 'teams' | 'teamsLocked' | 'modeOptions'>>;
export const DEFAULT_CONFIG: LobbyConfig = { game: DEFAULT_GAME, difficulty: DEFAULT_DIFFICULTY, map: DEFAULT_MAP, seed: 1, modeId: DEFAULT_MODE, teams: null, teamsLocked: false, modeOptions: {} };

// What the phones receive: the lobby config plus the chosen game's control labels and how-to steps (from the registry).
export type ConfigMsg = { t: 'config' } & LobbyConfig & GameInfo;
export const configMsg = (cfg: LobbyConfig, games?: Parameters<typeof gameInfo>[1]): ConfigMsg => ({ t: 'config', ...cfg, ...gameInfo(cfg.game, games, cfg.modeId) });

export interface PublicPlayer {
  id: number;
  name: string;
  color: string;
  slot: number;
  connected: boolean;
  teamId: number | null; // the relay fills it from the lobby teams; null: no teams assigned (or a spectator)
  assist?: true; // the player chose Ayudante in the lobby (assist.ts); absent otherwise
  school?: true; // this phone already did (or skipped) the Cocina escuela: the relay keeps it with the slot, the screen does not offer the school when everybody has it
}
// Cocina escuela, screen -> one phone: where this chef is (step of `total`, step === total: finished), what to do (<= 8 words), and which button to light.
export interface SchoolMsg { step: number; total: number; text: string; btn?: 'a' | 'b'; done?: true }

export type ClientMsg =
  | { t: 'join'; name: string; token: string }
  | ({ t: 'input' } & InputState)
  | { t: 'ping'; id: number; t0: number; rtt?: number; off?: number }
  | ({ t: 'phase' } & PhaseInfo) // screen only
  | ({ t: 'config' } & ConfigFromScreen) // screen only
  | { t: 'puesto'; puestos: PuestoId[] } // phone: "Cambiar" picked another puesto
  | { t: 'setTeam'; teamId: number } // phone: "Cambiar de equipo" (the screen decides: it is the host and owns the lobby)
  | { t: 'buzz'; playerId: number; kind: BuzzKind } // screen only: vibrate that phone
  | ({ t: 'hint'; playerId: number } & HintLabels) // screen only: what A and B do for that chef right now (null: the game's own label), their icons and whether they are greyed; no third button
  | { t: 'assist'; on: boolean } // phone: switch Ayudante on or off for this player (lobby only; the relay keeps it with the player's slot)
  | ({ t: 'school'; playerId: number } & SchoolMsg) // screen only: the step and instruction of that chef in the Cocina escuela
  | { t: 'schoolDone'; skip?: true } // phone: this player already did the school (skip: just pressed "Saltar" during it); the relay keeps it with the slot
  | { t: 'nav'; key: NavKey }; // phone: a D-pad button (only the Captain's is forwarded; the relay stamps who sent it)

export type ServerMsg =
  | { t: 'joined'; player: PublicPlayer; room: string; v: number }
  | { t: 'error'; reason: string }
  | { t: 'pong'; id: number; t0: number; ts: number }
  | { t: 'state'; players: PublicPlayer[] }
  | { t: 'player_joined'; player: PublicPlayer }
  | { t: 'player_left'; playerId: number } // disconnected, slot still held
  | { t: 'player_removed'; playerId: number } // grace expired, slot freed
  | ({ t: 'phase' } & PhaseInfo)
  | ConfigMsg
  | ({ t: 'input'; playerId: number } & InputState)
  | { t: 'rtt'; playerId: number; rtt: number; off: number }
  | { t: 'puesto'; playerId: number; puestos: PuestoId[] }
  | { t: 'setTeam'; playerId: number; teamId: number } // to the screens: this phone asks to change team
  | { t: 'you'; teamId: number; color: string; icon: string; sideLabel?: string } // to one phone: its team (when it has one)
  | { t: 'buzz'; kind: BuzzKind }
  | ({ t: 'hint' } & HintLabels) // the label, icon and greyed state of A and B right now (null: back to the game's label)
  | { t: 'assist'; playerId: number; on: boolean } // to the screens, and to that phone itself (it remembers across a reconnect): this player's Ayudante is now on / off
  | ({ t: 'school' } & SchoolMsg) // to one phone: its step in the Cocina escuela
  | { t: 'schoolDone'; playerId: number; skip?: true } // to the screens: this phone knows the school (skip: it pressed "Saltar" now, the chef is done)
  | { t: 'captain'; playerId: number | null } // to everyone: who holds the crown now (null: nobody is connected)
  | { t: 'nav'; from: number; key: NavKey }; // to the screens: the Captain's phone pressed this. `from` is set by the relay from the socket, never taken from the payload

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

const parsePuestoIds = (v: unknown, max = 4): PuestoId[] | null => (Array.isArray(v) && v.length <= max && v.every(isPuestoId) ? [...v] : null);
function parsePuestoMsg(v: any): PuestoMsg | null {
  if (!v || typeof v !== 'object' || typeof v.cheese !== 'boolean' || typeof v.sink !== 'boolean' || !Array.isArray(v.assign) || v.assign.length > MAX_PLAYERS) return null;
  const assign: PuestoAssign[] = [];
  for (const a of v.assign) {
    const puestos = parsePuestoIds(a?.puestos), pool = parsePuestoIds(a?.pool, PUESTO_IDS.length);
    if (!a || !num(a.id) || !puestos || !pool) return null;
    assign.push({ id: a.id, puestos, pool });
  }
  return { cheese: v.cheese, sink: v.sink, assign };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const intIn = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

// null = no teams. undefined = malformed (the whole message is refused).
export function parseTeams(v: unknown): TeamInfo[] | null | undefined {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_TEAMS) return undefined;
  const out: TeamInfo[] = [];
  const seenIds = new Set<number>(), seenPlayers = new Set<number>();
  for (const t of v) {
    if (!t || typeof t !== 'object' || !intIn(t.id, 0, MAX_TEAMS - 1) || seenIds.has(t.id) || !text(t.name, 16) || typeof t.color !== 'string' || !HEX.test(t.color) || !text(t.icon, 4)) return undefined;
    if (t.side !== undefined && !text(t.side, 16)) return undefined;
    if (!Array.isArray(t.playerIds) || t.playerIds.length > MAX_PLAYERS || !t.playerIds.every((id: unknown) => intIn(id, 0, 2 ** 31) && !seenPlayers.has(id as number) && seenPlayers.add(id as number))) return undefined;
    seenIds.add(t.id);
    out.push({ id: t.id, name: t.name, color: t.color, icon: t.icon, ...(t.side !== undefined ? { side: t.side } : {}), playerIds: [...t.playerIds] });
  }
  return out;
}

const VERDICTS: readonly Verdict[] = ['win', 'draw', 'nowinner', 'aborted'];
export function parsePhoneResult(v: any): PhoneResult | null {
  if (!v || typeof v !== 'object' || !VERDICTS.includes(v.verdict) || !(v.winner === null || intIn(v.winner, 0, MAX_TEAMS - 1))) return null;
  if (!Array.isArray(v.scores) || v.scores.length < 1 || v.scores.length > MAX_TEAMS || !v.scores.every((x: any) => x && intIn(x.team, 0, MAX_TEAMS - 1) && num(x.score))) return null;
  if (v.verdict === 'win' ? v.winner === null : v.winner !== null) return null; // a win names its team; no other verdict does
  return { verdict: v.verdict, winner: v.winner, scores: v.scores.map((x: { team: number; score: number }) => ({ team: x.team, score: x.score })) };
}

export function parseModeOptions(v: unknown): ModeOptions | undefined {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) return undefined;
  const entries = Object.entries(v);
  if (entries.length > 8) return undefined;
  const out: ModeOptions = {};
  for (const [k, x] of entries) {
    if (!text(k, 32) || k === '__proto__' || !(typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)) || (typeof x === 'string' && x.length <= 32))) return undefined;
    out[k] = x;
  }
  return out;
}

export function parseClientMessage(raw: string): ClientMsg | null {
  let m: any;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  switch (m.t) {
    case 'join':
      if (typeof m.name !== 'string' || typeof m.token !== 'string' || !m.token) return null;
      return { t: 'join', name: m.name.trim().slice(0, 16) || 'Player', token: m.token.slice(0, 64) };
    case 'input':
      if (!num(m.seq) || !num(m.x) || !num(m.y) || !num(m.btn) || !num(m.ts)) return null;
      if (!Array.isArray(m.presses) || !m.presses.every(num)) return null;
      const sig = m.sig && typeof m.sig === 'object' && (SIGNAL_KINDS as readonly string[]).includes(m.sig.kind) && Number.isInteger(m.sig.seq) ? { kind: m.sig.kind as SignalKind, seq: ((m.sig.seq % PRESS_MOD) + PRESS_MOD) % PRESS_MOD } : undefined; // a malformed signal is dropped, never the whole input
      return {
        t: 'input',
        seq: m.seq,
        x: clamp1(m.x),
        y: clamp1(m.y),
        btn: m.btn | 0,
        presses: m.presses.slice(0, BUTTON_COUNT).map((p: number) => ((p % PRESS_MOD) + PRESS_MOD) % PRESS_MOD),
        ts: m.ts,
        ...(sig ? { sig } : {}),
        ...(m.go === true ? { go: true } : {}),
      };
    case 'ping':
      if (!num(m.id) || !num(m.t0)) return null;
      return { t: 'ping', id: m.id, t0: m.t0, rtt: num(m.rtt) ? m.rtt : undefined, off: num(m.off) ? m.off : undefined };
    case 'phase': {
      if (!PHASES.includes(m.phase)) return null;
      const out: ClientMsg = { t: 'phase', phase: m.phase };
      if (m.match !== undefined) {
        const mt = m.match, teams = mt && typeof mt === 'object' ? parseTeams(mt.teams) : undefined, opts = mt && typeof mt === 'object' ? parseModeOptions(mt.modeOptions) : undefined;
        if (!mt || typeof mt !== 'object' || !isGameId(mt.gameId) || !isModeId(mt.modeId) || !text(mt.mapId, 16) || !isDifficulty(mt.difficulty) || teams === undefined || !opts) return null;
        out.match = { gameId: mt.gameId, modeId: mt.modeId, mapId: mt.mapId, difficulty: mt.difficulty, teams, modeOptions: opts };
      }
      if (m.scores !== undefined) {
        if (!Array.isArray(m.scores) || !m.scores.every((x: any) => x && num(x.id) && num(x.score))) return null;
        out.scores = m.scores.map((x: Score) => ({ id: x.id, score: x.score }));
      }
      if (m.result !== undefined) {
        const r = parsePhoneResult(m.result);
        if (!r) return null;
        out.result = r;
      }
      if (m.puestos !== undefined) {
        const p = parsePuestoMsg(m.puestos);
        if (!p) return null;
        out.puestos = p;
      }
      return out;
    }
    case 'puesto': {
      const ids = parsePuestoIds(m.puestos);
      return ids?.length ? { t: 'puesto', puestos: ids } : null;
    }
    case 'setTeam':
      return intIn(m.teamId, 0, MAX_TEAMS - 1) ? { t: 'setTeam', teamId: m.teamId } : null;
    case 'buzz':
      return num(m.playerId) && isBuzzKind(m.kind) ? { t: 'buzz', playerId: m.playerId, kind: m.kind } : null;
    case 'hint': {
      const label = (v: unknown): string | null | undefined => (v === null || v === undefined ? null : typeof v === 'string' && v.trim() && v.length <= LABEL_MAX ? v : undefined);
      const a = label(m.a), b = label(m.b);
      const icon = (v: unknown): IconId | null | undefined => (v === undefined || v === null ? null : isIconId(v) ? v : undefined);
      const aIcon = icon(m.aIcon), bIcon = icon(m.bIcon);
      if (!num(m.playerId) || a === undefined || b === undefined || aIcon === undefined || bIcon === undefined) return null;
      return { t: 'hint', playerId: m.playerId, a, b, ...hintExtras({ a, b, ...(aIcon ? { aIcon } : {}), ...(bIcon ? { bIcon } : {}), ...(m.aOff === true ? { aOff: true } : {}), ...(m.bOff === true ? { bOff: true } : {}) }) };
    }
    case 'assist':
      return typeof m.on === 'boolean' ? { t: 'assist', on: m.on } : null;
    case 'schoolDone':
      return { t: 'schoolDone', ...(m.skip === true ? { skip: true as const } : {}) };
    case 'school': {
      if (!num(m.playerId) || !intIn(m.step, 0, 8) || !intIn(m.total, 1, 8) || m.step > m.total || !text(m.text, 48) || !(m.btn === undefined || m.btn === 'a' || m.btn === 'b')) return null;
      return { t: 'school', playerId: m.playerId, step: m.step, total: m.total, text: m.text, ...(m.btn ? { btn: m.btn } : {}), ...(m.done === true ? { done: true as const } : {}) };
    }
    case 'nav':
      return isNavKey(m.key) ? { t: 'nav', key: m.key } : null; // anything else in the payload (a fake `from`) is dropped here
    case 'config':
      if (!isGameId(m.game) || !isDifficulty(m.difficulty) || !(isMapChoice(m.map) || isVersusChoice(m.map)) || !isSeed(m.seed)) return null; // versus lobbies hold a versus map choice (V1.., vs-auto, vs-random)
      {
        const modeId = m.modeId === undefined ? DEFAULT_MODE : m.modeId; // a v1 screen sends none: cooperative
        const game = GAMES.find((g) => g.id === m.game)!;
        const teams = parseTeams(m.teams), modeOptions = parseModeOptions(m.modeOptions);
        if (!isModeId(modeId) || !resolveModes(game).some((x) => x.id === modeId) || teams === undefined || !modeOptions || (m.teamsLocked !== undefined && typeof m.teamsLocked !== 'boolean')) return null;
        return { t: 'config', game: m.game, difficulty: m.difficulty, map: m.map, seed: m.seed, modeId, teams, teamsLocked: m.teamsLocked === true, modeOptions };
      }
    default:
      return null;
  }
}

// The phone's own team, derived from the lobby teams (the relay sends it as 'you'; the same function serves the tests).
export function youMsg(teams: readonly TeamInfo[] | null | undefined, playerId: number): Extract<ServerMsg, { t: 'you' }> | null {
  const t = teamOf(teams, playerId);
  return t ? { t: 'you', teamId: t.id, color: t.color, icon: t.icon, ...(t.side ? { sideLabel: t.side } : {}) } : null;
}

export type PhaseEvent = 'pick' | 'back' | 'start' | 'timeout' | 'again' | 'practice' | 'endPractice';
export function nextPhase(phase: Phase, ev: PhaseEvent): Phase {
  if (phase === 'lobby' && ev === 'practice') return 'school';
  if (phase === 'school' && ev === 'endPractice') return 'lobby';
  if (phase === 'menu' && ev === 'pick') return 'lobby';
  if (phase === 'lobby' && ev === 'back') return 'menu';
  if (phase === 'lobby' && ev === 'start') return 'playing';
  if (phase === 'playing' && ev === 'timeout') return 'results';
  if (phase === 'results' && ev === 'again') return 'lobby';
  return phase;
}
export const canStart = (players: { connected: boolean }[]) => players.some((p) => p.connected);

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function newRoomCode(rand: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) c += ROOM_ALPHABET[Math.floor(rand() * ROOM_ALPHABET.length)];
  return c;
}

export function applyDeadzone(x: number, y: number, dz = DEADZONE): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag < dz) return [0, 0];
  const k = Math.min(mag, 1) / mag;
  return [x * k, y * k];
}

// Press counters: a tap is never lost even if it falls between frames.
export function pressDelta(prev: number, next: number): number {
  return (((next - prev) % PRESS_MOD) + PRESS_MOD) % PRESS_MOD;
}

export class PressTracker {
  private last: number[] = [];
  reset() {
    this.last = [];
  }
  // Returns new presses per button since the previous call. The first sample after reset is a baseline,
  // and a jump over half the range is a phone that restarted its counter: neither counts as presses.
  update(presses: number[]): number[] {
    const out = presses.map((p, i) => {
      const prev = this.last[i];
      if (prev === undefined) return 0;
      const d = pressDelta(prev, p);
      return d > PRESS_MOD / 2 ? 0 : d;
    });
    this.last = presses.slice();
    return out;
  }
}

// Estimates (server clock - local clock) using the lowest-RTT sample of the last N.
export class ClockSync {
  private samples: { rtt: number; off: number }[] = [];
  constructor(private max = 10) {}
  add(rtt: number, t0: number, serverTs: number) {
    this.samples.push({ rtt, off: serverTs - (t0 + rtt / 2) });
    if (this.samples.length > this.max) this.samples.shift();
  }
  get offset(): number | null {
    if (!this.samples.length) return null;
    return this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).off;
  }
}
