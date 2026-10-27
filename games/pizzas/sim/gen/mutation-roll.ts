// The generator rolls the v2 mutation (design section 6): the ops are DATA of the map, drawn here with the generator's stream. Easy changes only floor (ice), Normal adds one station that moves,
// Hard moves two things and sometimes puts them back after 30 s.
import type { Rng } from '@pichi/core/rng';
import type { Difficulty } from '@pichi/core/difficulty';
import { MOVABLE, opsProblems, type MutationV2, type Op } from '../mech/mutation/ops';

export const ROUND_AT = 5400; // 1:30
const WARN = 180;
const REVERT_AFTER = 1800;
type P = readonly [number, number];

const spots = (rows: readonly string[], ok: (ch: string) => boolean): P[] =>
  rows.flatMap((r, y) => [...r].flatMap((ch, x) => (x >= 1 && x <= 14 && y >= 1 && y <= 7 && ok(ch) ? [[x, y] as P] : [])));
const draw = <T>(rng: Rng, xs: T[]): T | undefined => xs.splice(Math.floor(rng() * xs.length), 1)[0];

/** The mutation of a decorated map, or undefined when the dice and the map found nothing that validates (the map then has none). */
export function rollMutation(rows: readonly string[], rng: Rng, diff: Difficulty): MutationV2 | undefined {
  const floors = spots(rows, (c) => c === '.');
  const movers = spots(rows, (c) => MOVABLE.has(c) && c !== 'M'); // M moves only by hand-made maps: its handles must stay free
  const ops: Op[] = [];
  const iceCount = diff === 'easy' ? 1 + Math.floor(rng() * 2) : 0;
  for (let i = 0; i < iceCount; i++) {
    const p = draw(rng, floors);
    if (p) ops.push(['tile', p, 'i']);
  }
  const moves = diff === 'easy' ? 0 : diff === 'normal' ? (rng() < 0.5 ? 1 : 0) : 2;
  if (diff === 'normal' && !moves && floors.length) {
    const p = draw(rng, floors);
    if (p) ops.push(['tile', p, 'i']);
  }
  for (let i = 0; i < moves; i++) {
    const from = draw(rng, movers),
      to = draw(rng, floors);
    if (from && to) ops.push(['move', from, to]);
  }
  if (!ops.length) return undefined;
  const revertAt = diff === 'hard' && rng() < 0.5 ? ROUND_AT + REVERT_AFTER : null;
  const m: MutationV2 = { at: ROUND_AT, warn: WARN, revertAt, ops };
  return opsProblems(rows, m).length ? undefined : m;
}
