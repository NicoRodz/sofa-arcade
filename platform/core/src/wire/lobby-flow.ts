import type { TeamInfo } from '../lobby/teams';
import { teamOf } from '../lobby/teams';
import { ROOM_CODE_LEN, type Phase } from './constants';
import type { ServerMsg } from './server-msg';

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
