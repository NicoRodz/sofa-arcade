import type { Snap } from './snapshot';

// DEBUG_BOT=1 progress line printed while a wait polls the screen
export function logSnap(s: Snap) {
  console.log(
    s.time | 0,
    'fps',
    s.fps.toFixed(0),
    'score',
    s.score,
    s.players.map((p) => `${p.id}:${p.x.toFixed(1)},${p.y.toFixed(1)}:${p.item}${p.cutting ? '*' : ''}`).join(' '),
    s.stations
      .filter((x) => x.item || x.inputs.length)
      .map((x) => `${x.kind}@${x.tx},${x.ty}=${x.item ?? x.inputs}`)
      .join(' '),
  );
}
