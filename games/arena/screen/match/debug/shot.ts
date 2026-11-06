// Capture-tool hooks for the projectiles (`window.__pg.manchazoPin*`, only through the shell's `debug`): they hold an aim, a shot in the air or a passed Pegote still for a
// screenshot on a free stretch of floor (the 4K capture cannot race a 0.6 s flight). The sim runs on; a timer puts the held thing back every few ms.
import { MAP_H, MAP_W, solidAt } from '../../../map';
import { AIM_TICKS, SHOT_RANGE_UNITS, type ManchazoState, type SabotageKind } from '../../../sim';

type Get = () => ManchazoState | undefined;
const timers = new Set<number>();

/** The first row with `n` free tiles in a row, scanning from the middle of the board outwards: [x of the first tile, y], or null. */
function freeRun(s: ManchazoState, n: number): [number, number] | null {
  const order = Array.from({ length: MAP_H }, (_v, y) => y).sort((a, b) => Math.abs(a - MAP_H / 2) - Math.abs(b - MAP_H / 2));
  for (const y of order)
    for (let x = 1; x + n < MAP_W - 1; x++)
      if (Array.from({ length: n }, (_v, k) => x + k).every((tx) => !solidAt(s.grid.map, tx, y))) return [x, y];
  return null;
}
const index = (s: ManchazoState, slot: number) => s.grid.bodies.findIndex((b) => b.slot === slot);
const put = (s: ManchazoState, i: number, tx: number, ty: number) => {
  [s.grid.bodies[i]!.x, s.grid.bodies[i]!.y] = [tx * 16 + 8, ty * 16 + 8];
};

export function shotDebug(get: Get) {
  const hold = (fn: () => void) => timers.add(window.setInterval(fn, 4));
  return {
    /** `shooter` at the left end of a free run of 10 tiles facing right, the rival `target` at the other end; held: the aim of `kind` (`aim`) or one shot of it halfway (`!aim`). Returns the row. */
    manchazoPinShot(shooter: number, target: number, kind: SabotageKind, aim: boolean): number {
      const s = get();
      const [a, b] = s ? [index(s, shooter), index(s, target)] : [-1, -1];
      const run = s && freeRun(s, 10);
      if (!s?.match.sab?.shot || a < 0 || b < 0 || !run) return -1;
      const [x, y] = run;
      const sh = s.match.sab.shot;
      put(s, a, x, y);
      put(s, b, x + 9, y);
      s.match.bodies[a]!.face = 0;
      s.match.sab.held[a] = aim ? kind : null; // a shot in the air has left the hand
      hold(() => {
        s.match.bodies[a]!.stun = 0;
        s.match.bodies[a]!.face = 0;
        if (aim) {
          sh.prep[a] = AIM_TICKS - 5;
          return;
        }
        sh.prep[a] = 0;
        sh.shots = [
          {
            id: 900,
            kind,
            owner: a,
            team: s.grid.bodies[a]!.team,
            x: (x + 4) * 16 + 8,
            y: y * 16 + 8,
            dir: 0,
            left: SHOT_RANGE_UNITS - 60,
            tx: x + 4,
            ty: y,
            lx: x + 3,
            ly: y,
          },
        ];
      });
      return y;
    },
    /** A Pegote of `passer`'s colour on `carrier` (passes 1, lock running, fuse at 70) and the pass that put it there, replayed again and again so the arc is on screen. Returns the row. */
    manchazoPinPass(passer: number, carrier: number): number {
      const s = get();
      const [a, b] = s ? [index(s, passer), index(s, carrier)] : [-1, -1];
      const run = s && freeRun(s, 5);
      if (!s?.match.sab?.shot || a < 0 || b < 0 || !run) return -1;
      const [x, y] = run;
      put(s, b, x + 1, y);
      put(s, a, x + 3, y);
      const p = {
        id: s.match.nextId++,
        x: x + 1,
        y,
        team: s.grid.bodies[a]!.team,
        owner: a,
        fuse: 70,
        radius: 2,
        mod: 'glue' as const,
        stuck: b,
        passes: 1,
        lock: 20,
      };
      s.match.pinatas.push(p);
      const entry = { kind: 'pass' as const, tick: s.grid.tick - 6, body: a, target: b, x: x + 1, y, card: 'glue' as const };
      s.match.sab.shot.log.push(entry); // one entry, kept young: a pile of them would draw the arc over and over
      hold(() => {
        put(s, b, x + 1, y);
        put(s, a, x + 3, y);
        s.match.bodies[a]!.stun = s.match.bodies[b]!.stun = 0;
        p.fuse = Math.max(p.fuse, 70);
        p.lock = Math.max(p.lock, 20);
        entry.tick = s.grid.tick - 6;
      });
      return y;
    },
    manchazoUnpinShot() {
      timers.forEach((id) => window.clearInterval(id));
      timers.clear();
    },
  };
}
