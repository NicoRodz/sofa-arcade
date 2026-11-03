// The events' part of the round's hash (mixed only when the events are on, so a round without them keeps its hash).
import type { MatchState } from '../match/state';
import { ALL_EVENT_KINDS, EVENT_KINDS } from './config';
import { plusEventWords } from './plus-state';
import type { AnnounceKind } from './state';

const KINDS: readonly AnnounceKind[] = [
  ...EVENT_KINDS,
  'comeback',
  'hidden',
  'clockWarn',
  'overtime',
  'clockBroken',
  'blackout',
  'contagion',
  'happyHour',
  'move',
  'balloons',
  'warnScramble',
  'phaseScramble',
  'warnFinal',
  'phaseFinal',
];
const PHASES = ['idle', 'warn', 'live', 'done'];
const OUTCOMES = ['none', 'filled', 'broken', 'gone'];

export function eventsWords(m: MatchState): number[] {
  const ev = m.ev!;
  const c = ev.clock;
  const z = m.zone;
  return [
    ev.next,
    ev.active ? ALL_EVENT_KINDS.indexOf(ev.active.kind) + 1 : 0,
    ev.active?.end ?? 0,
    ev.big?.landAt ?? -1,
    ev.rain?.done ?? -1,
    ev.vac?.x ?? -1,
    ev.vac?.y ?? -1,
    ev.vac?.wait ?? -1,
    ev.comeback.team,
    ev.comeback.until,
    ev.comeback.cool,
    PHASES.indexOf(c.phase),
    OUTCOMES.indexOf(c.outcome),
    c.team,
    c.charge,
    c.endsAt,
    z ? z.y0 + 1 : 0,
    ...ev.log.flatMap((a) => [KINDS.indexOf(a.kind), a.tick, a.team]),
    ...(ev.plus ? plusEventWords(ev.plus) : []),
  ];
}
