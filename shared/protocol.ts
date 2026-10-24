import { DEFAULT_DIFFICULTY, isDifficulty, type Difficulty } from './difficulty';
import { DEFAULT_GAME, isGameId, type GameId } from './games';
import { DEFAULT_MAP, isMapChoice, type MapChoice } from './maps';

export { ROUND_MS } from './difficulty';

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
export const COLORS = ['#ff5252', '#40c4ff', '#ffd740', '#69f0ae', '#e040fb', '#ff9100', '#b2ff59', '#18ffff'];

// x right+, y down+, both in [-1, 1]. btn is a bitmask (state); presses are monotonic counters (mod PRESS_MOD).
export interface InputState {
  seq: number;
  x: number;
  y: number;
  btn: number;
  presses: number[];
  ts: number; // sender Date.now()
}

export const PHASES = ['lobby', 'playing', 'results'] as const;
export type Phase = (typeof PHASES)[number];
export interface Score { id: number; score: number }
export interface PhaseInfo { phase: Phase; scores?: Score[] }

// What the lobby has chosen; the screen owns it and the relay forwards it to the phones.
export const SEED_MAX = 2 ** 32;
export const isSeed = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < SEED_MAX;
export interface LobbyConfig { game: GameId; difficulty: Difficulty; map: MapChoice; seed: number }
export const DEFAULT_CONFIG: LobbyConfig = { game: DEFAULT_GAME, difficulty: DEFAULT_DIFFICULTY, map: DEFAULT_MAP, seed: 1 };

export interface PublicPlayer {
  id: number;
  name: string;
  color: string;
  slot: number;
  connected: boolean;
}

export type ClientMsg =
  | { t: 'join'; name: string; token: string }
  | ({ t: 'input' } & InputState)
  | { t: 'ping'; id: number; t0: number; rtt?: number; off?: number }
  | ({ t: 'phase' } & PhaseInfo) // screen only
  | ({ t: 'config' } & LobbyConfig); // screen only

export type ServerMsg =
  | { t: 'joined'; player: PublicPlayer; room: string }
  | { t: 'error'; reason: string }
  | { t: 'pong'; id: number; t0: number; ts: number }
  | { t: 'state'; players: PublicPlayer[] }
  | { t: 'player_joined'; player: PublicPlayer }
  | { t: 'player_left'; playerId: number } // disconnected, slot still held
  | { t: 'player_removed'; playerId: number } // grace expired, slot freed
  | ({ t: 'phase' } & PhaseInfo)
  | ({ t: 'config' } & LobbyConfig)
  | ({ t: 'input'; playerId: number } & InputState)
  | { t: 'rtt'; playerId: number; rtt: number; off: number };

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

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
      return {
        t: 'input',
        seq: m.seq,
        x: clamp1(m.x),
        y: clamp1(m.y),
        btn: m.btn | 0,
        presses: m.presses.slice(0, BUTTON_COUNT).map((p: number) => ((p % PRESS_MOD) + PRESS_MOD) % PRESS_MOD),
        ts: m.ts,
      };
    case 'ping':
      if (!num(m.id) || !num(m.t0)) return null;
      return { t: 'ping', id: m.id, t0: m.t0, rtt: num(m.rtt) ? m.rtt : undefined, off: num(m.off) ? m.off : undefined };
    case 'phase': {
      if (!PHASES.includes(m.phase)) return null;
      if (m.scores === undefined) return { t: 'phase', phase: m.phase };
      if (!Array.isArray(m.scores) || !m.scores.every((x: any) => x && num(x.id) && num(x.score))) return null;
      return { t: 'phase', phase: m.phase, scores: m.scores.map((x: Score) => ({ id: x.id, score: x.score })) };
    }
    case 'config':
      if (!isGameId(m.game) || !isDifficulty(m.difficulty) || !isMapChoice(m.map) || !isSeed(m.seed)) return null;
      return { t: 'config', game: m.game, difficulty: m.difficulty, map: m.map, seed: m.seed };
    default:
      return null;
  }
}

export type PhaseEvent = 'start' | 'timeout' | 'again';
export function nextPhase(phase: Phase, ev: PhaseEvent): Phase {
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
