// FNV-1a over the whole round (grid + paint + pinatas + stains): the replay check and the determinism and mirror tests use it.
import { hashMap } from '../../map';
import { hashGrid } from '../grid/hash';
import { liveWords } from '../living/hash';
import { eventsWords } from '../events/hash';
import { phaseWords } from '../phase/state';
import { rescueWords } from '../rescue/state';
import { sabotageWords } from '../sabotage/hash';
import type { ManchazoState } from './state';

export function hashManchazo(s: ManchazoState): number {
  let h = (hashGrid(s.grid) ^ hashMap(s.grid.map)) >>> 0;
  const mix = (v: number) => {
    for (let k = 0; k < 4; k++) h = Math.imul(h ^ ((v >>> (8 * k)) & 0xff), 0x01000193);
  };
  const m = s.match;
  for (const v of m.paint) mix(v + 1);
  for (const p of m.pinatas) [p.id, p.x, p.y, p.team, p.owner, p.fuse, p.radius].forEach(mix);
  for (const b of m.bodies) [b.stun, b.trail, b.trailTeam, b.face + 1].forEach(mix);
  [...m.reserve, ...m.reachedAt, m.nextId].forEach(mix);
  if (m.sab) {
    for (const p of m.pinatas) [p.mod === 'glue' ? 2 : p.mod === 'turpentine' ? 1 : 0, p.stuck ?? -1].forEach(mix);
    sabotageWords(m.sab).forEach(mix);
    if (m.sab.shot) for (const p of m.pinatas) [p.passes ?? -1, p.lock ?? 0].forEach(mix); // PR4: the Pegote's passes
  }
  if (m.ev) eventsWords(m).forEach(mix);
  if (m.live) liveWords(m.live).forEach(mix);
  if (m.ph) phaseWords(m.ph).forEach(mix);
  if (m.res) rescueWords(m.res).forEach(mix);
  return h >>> 0;
}
