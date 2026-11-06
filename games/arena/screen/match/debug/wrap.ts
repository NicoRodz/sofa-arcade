// Capture-tool hooks for the sponge v2 and the packing tape (`window.__pg.manchazoPinWrap`, only through the shell's `debug`): they put a body on a free stretch of floor and
// hold what a screenshot needs (the soaking diamond, the squeeze flying out, a tape on the floor) while the sim runs on; a timer puts it back every few ms.
import { MAP_H, MAP_W, solidAt } from '../../../map';
import { blastTiles, bodyTile, paintTile, squeezeSponge, startSponge, startTape, type ManchazoState } from '../../../sim';

type Get = () => ManchazoState | undefined;
const timers = new Set<number>();

/** The free tile nearest to the middle of the board with no furniture within 4 tiles (Manhattan), or null. */
function freeSpot(s: ManchazoState): [number, number] | null {
  const tiles = Array.from({ length: MAP_W * MAP_H }, (_v, i): [number, number] => [i % MAP_W, Math.floor(i / MAP_W)]);
  tiles.sort((a, b) => Math.abs(a[0] - 13) + Math.abs(a[1] - 7) - (Math.abs(b[0] - 13) + Math.abs(b[1] - 7)) || a[1] - b[1] || a[0] - b[0]);
  for (const [x, y] of tiles) if (blastTiles(x, y, 4, s.grid.map).length >= 41 && !solidAt(s.grid.map, x, y)) return [x, y];
  return null;
}

export function wrapDebug(get: Get) {
  return {
    /** `what`: 'soak' (the sponge soaking the rival paint round `slot`), 'squeeze' (its squeeze flying out, radius 3) or 'tape' (a strip down across its heading). Returns the row, -1 if it could not. */
    manchazoPinWrap(slot: number, what: 'soak' | 'squeeze' | 'tape'): number {
      const s = get();
      const a = s?.grid.bodies.findIndex((b) => b.slot === slot) ?? -1;
      const plus = s?.match.sab?.plus;
      const spot = s && freeSpot(s);
      if (!s || !plus?.wrap || a < 0 || !spot) return -1;
      const [x, y] = spot;
      const team = s.grid.bodies[a]!.team;
      const put = () => {
        s.grid.bodies[a]!.x = x * 16 + 8;
        s.grid.bodies[a]!.y = y * 16 + 8;
        s.match.bodies[a]!.face = 0;
        s.match.bodies[a]!.stun = 0;
      };
      put();
      timers.add(window.setInterval(put, 4));
      if (what === 'tape') {
        startTape(s, a);
        timers.add(window.setInterval(() => plus.wrap!.strips.forEach((t) => (t.left = Math.max(t.left, 240))), 4));
        return y;
      }
      for (const [tx, ty] of blastTiles(x, y, 2, s.grid.map)) paintTile(s.match, tx, ty, 1 - team, s.grid.tick); // the rival's floor, all round
      s.match.sab!.held[a] = 'sponge';
      startSponge(s, a);
      if (what === 'soak') {
        timers.add(
          window.setInterval(() => {
            plus.sponge[a] = 300;
            plus.wrap!.soak[a] = 40;
          }, 4),
        );
        return y;
      }
      squeezeSponge(s, a); // the diamond fills with `team`'s colour; the flash is held on screen
      timers.add(window.setInterval(() => (plus.squeezeFx[a] = 12), 4));
      return bodyTile(s.grid.bodies[a]!, 0)[1];
    },
    manchazoUnpinWrap() {
      timers.forEach((id) => window.clearInterval(id));
      timers.clear();
    },
  };
}
