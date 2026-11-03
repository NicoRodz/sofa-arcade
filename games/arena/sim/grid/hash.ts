// FNV-1a over the integer state: the replay check ("same hash at tick 600 and 3600") and the determinism tests use it.
import type { GridState } from './state';

export function hashGrid(s: GridState): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((v >>> 24) & 0xff), 0x01000193);
  };
  mix(s.tick);
  for (const b of s.bodies) {
    mix(b.slot);
    mix(b.x);
    mix(b.y);
    mix(b.dir + 1);
    mix(b.q + 1);
    mix(b.last + 1);
    mix(b.rest);
    mix(b.frac);
    mix(b.req ? b.req.dir + 1 + (b.req.age << 3) + (b.req.idle << 16) : 0);
    mix(b.stats.requested);
    mix(b.stats.executed);
    mix(b.stats.failed);
    mix(b.stats.cancelled);
  }
  return h >>> 0;
}
