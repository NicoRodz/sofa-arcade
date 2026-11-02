// Capture-tool hooks for the living map (`window.__pg.manchazoLiving*`, only through the shell's `debug`): they re-time an element so its change falls in a
// given number of ticks, or give a pivot an owner, nothing else. The sim itself runs on the real 60 Hz clock.
import type { ManchazoState } from '../../sim';

type Get = () => ManchazoState | undefined;

export function livingDebug(get: Get) {
  return {
    /** The `n`-th pair of kind `kind` ('brush' | 'sofa') changes in `ticks` ticks; with 'fountain', the fountain splashes in `ticks`. Returns what it found. */
    manchazoLivingIn(kind: 'brush' | 'sofa' | 'fountain', n: number, ticks: number): { x: number; y: number } | null {
      const live = get()?.match.live;
      const t = get()?.grid.tick ?? 0;
      if (!live) return null;
      const retime = (o: { period: number; offset: number }) =>
        (o.offset = (((o.period - ((t + ticks) % o.period)) % o.period) + o.period) % o.period);
      if (kind === 'fountain') {
        if (!live.fountain) return null;
        retime(live.fountain);
        return { x: live.fountain.x, y: live.fountain.y };
      }
      const p = live.pairs.filter((q) => q.spec.kind === kind)[n];
      if (!p) return null;
      retime(p);
      return { x: p.spec.x, y: p.spec.y };
    },
    /** The pivot of a brush (side 0 left, 1 right) is claimed by `team`. */
    manchazoLivingOwner(n: number, side: 0 | 1, team: number) {
      const p = get()?.match.live?.pairs.filter((q) => q.spec.kind === 'brush')[n];
      if (p) p.owner[side] = team;
    },
    /** How many pairs of each kind the round has. */
    manchazoLivingCount(): Record<string, number> {
      const live = get()?.match.live;
      const out: Record<string, number> = { brush: 0, sofa: 0, fountain: live?.fountain ? 1 : 0 };
      live?.pairs.forEach((p) => out[p.spec.kind]!++);
      return out;
    },
  };
}
