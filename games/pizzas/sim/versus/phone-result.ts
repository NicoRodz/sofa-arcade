// The verdict a phone gets at the end of a versus match, as it travels in the `result` slot of the phase message: the validator the platform asks for.
import { MAX_TEAMS, intIn, num } from '@pichi/core';
import type { PhoneResult, Verdict } from './report';

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
