// Wire-format parsers shared by the lobby messages: the validated pieces (teams, a versus result, mode options) and the tiny guards they and
// the protocol parser use. Moved out of protocol.ts unchanged (which re-exports them) to leave that file room.
import type { PhoneResult, Verdict } from '@pichi/game-pizzas/sim/versus/report';
import { MAX_TEAMS, type TeamInfo } from './teams';

export const MAX_PLAYERS = 8;
export type ModeOptions = Record<string, boolean | number | string>;
export const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const HEX = /^#[0-9a-fA-F]{6}$/;
export const intIn = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
export const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

// null = no teams. undefined = malformed (the whole message is refused).
export function parseTeams(v: unknown): TeamInfo[] | null | undefined {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_TEAMS) return undefined;
  const out: TeamInfo[] = [];
  const seenIds = new Set<number>(),
    seenPlayers = new Set<number>();
  for (const t of v) {
    if (
      !t ||
      typeof t !== 'object' ||
      !intIn(t.id, 0, MAX_TEAMS - 1) ||
      seenIds.has(t.id) ||
      !text(t.name, 16) ||
      typeof t.color !== 'string' ||
      !HEX.test(t.color) ||
      !text(t.icon, 4)
    )
      return undefined;
    if (t.side !== undefined && !text(t.side, 16)) return undefined;
    if (
      !Array.isArray(t.playerIds) ||
      t.playerIds.length > MAX_PLAYERS ||
      !t.playerIds.every((id: unknown) => intIn(id, 0, 2 ** 31) && !seenPlayers.has(id as number) && seenPlayers.add(id as number))
    )
      return undefined;
    seenIds.add(t.id);
    out.push({
      id: t.id,
      name: t.name,
      color: t.color,
      icon: t.icon,
      ...(t.side !== undefined ? { side: t.side } : {}),
      playerIds: [...t.playerIds],
    });
  }
  return out;
}

const VERDICTS: readonly Verdict[] = ['win', 'draw', 'nowinner', 'aborted'];
export function parsePhoneResult(v: any): PhoneResult | null {
  if (!v || typeof v !== 'object' || !VERDICTS.includes(v.verdict) || !(v.winner === null || intIn(v.winner, 0, MAX_TEAMS - 1)))
    return null;
  if (
    !Array.isArray(v.scores) ||
    v.scores.length < 1 ||
    v.scores.length > MAX_TEAMS ||
    !v.scores.every((x: any) => x && intIn(x.team, 0, MAX_TEAMS - 1) && num(x.score))
  )
    return null;
  if (v.verdict === 'win' ? v.winner === null : v.winner !== null) return null; // a win names its team; no other verdict does
  return {
    verdict: v.verdict,
    winner: v.winner,
    scores: v.scores.map((x: { team: number; score: number }) => ({ team: x.team, score: x.score })),
  };
}

export function parseModeOptions(v: unknown): ModeOptions | undefined {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) return undefined;
  const entries = Object.entries(v);
  if (entries.length > 8) return undefined;
  const out: ModeOptions = {};
  for (const [k, x] of entries) {
    if (
      !text(k, 32) ||
      k === '__proto__' ||
      !(typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)) || (typeof x === 'string' && x.length <= 32))
    )
      return undefined;
    out[k] = x;
  }
  return out;
}
