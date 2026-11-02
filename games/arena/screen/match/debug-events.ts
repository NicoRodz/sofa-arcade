// Capture-tool hooks for the events (`window.__pg.manchazo*`, only through the shell's `debug`): they put the round in the state a screenshot needs, nothing else.
import {
  CLOCK_FROM_TICKS,
  CLOCK_FULL,
  EVENT_KINDS,
  paintTile,
  startMajor,
  type EventKind,
  type ManchazoState,
  type Planned,
} from '../../sim';
import { MAP_W, solidAt } from '../../map';

type Get = () => ManchazoState | undefined;

export function eventDebug(get: Get) {
  const circle = (s: ManchazoState, fn: (x: number, y: number) => void) => {
    const c = s.match.ev!.clock;
    for (let y = c.row - 1; y <= c.row + 1; y++) for (let x = 12; x <= 14; x++) fn(x, y);
  };
  return {
    /** Starts the event now (the one the program drew, or a default one when it did not draw it). */
    manchazoEvent(kind: EventKind) {
      const s = get();
      const ev = s?.match.ev;
      if (!s || !ev || !EVENT_KINDS.includes(kind)) return;
      const q = ev.program.find((p) => p.kind === kind);
      const p: Planned = { kind, at: s.grid.tick, row: q?.row ?? 6, down: q?.down ?? true, order: q ? [...q.order] : [] };
      if (kind === 'rain' && p.order.length === 0)
        for (let y = p.row; y < p.row + 3; y++) for (let x = 0; x <= 13; x++) if (!solidAt(s.grid.map, x, y)) p.order.push(y * MAP_W + x);
      Object.assign(ev, { active: null, big: null, rain: null, vac: null });
      ev.program.splice(ev.next, 0, p);
      startMajor(s, p);
    },
    /** The round jumps to 30 s left with `loser` trailing by a wide margin: the Hourglass falls within a second. */
    manchazoClockFall(loser: number) {
      const s = get();
      if (!s?.match.ev) return;
      s.match.ev.next = s.match.ev.program.length;
      s.match.paint.forEach((v, i) => {
        if (v !== loser) return; // the trailing team has nothing; the other holds its own side
        s.match.paint[i] = -1;
        s.match.counts[loser]!--;
      });
      for (let y = 0; y < 15; y++)
        for (let x = 0; x < MAP_W; x++)
          if ((loser === 1 ? x <= 11 : x >= 15) && !solidAt(s.grid.map, x, y)) paintTile(s.match, x, y, 1 - loser, 0);
      s.grid.tick = s.grid.durationTicks - CLOCK_FROM_TICKS;
    },
    /** The circle painted in `team`'s colour and the first body of that team standing in its middle; returns its slot (-1: none). */
    manchazoClockCarrier(team: number): number {
      const s = get();
      if (!s?.match.ev) return -1;
      circle(s, (x, y) => paintTile(s.match, x, y, team, s.grid.tick));
      const b = s.grid.bodies.find((q) => q.team === team);
      if (b) [b.x, b.y] = [13 * 16 + 8, s.match.ev.clock.row * 16 + 8];
      return b?.slot ?? -1;
    },
    /** Paints a rectangle of floor for a team (the rain has something to wash out). */
    manchazoPaint(team: number, x0: number, y0: number, x1: number, y1: number) {
      const s = get();
      if (s)
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) if (!solidAt(s.grid.map, x, y)) paintTile(s.match, x, y, team, s.grid.tick);
    },
    /** The first body of `team` on a tile; returns its slot. */
    manchazoPutTeam(team: number, x: number, y: number): number {
      const b = get()?.grid.bodies.find((q) => q.team === team);
      if (b) [b.x, b.y] = [x * 16 + 8, y * 16 + 8];
      return b?.slot ?? -1;
    },
    /** Puts body `slot` on a tile. */
    manchazoPut(slot: number, x: number, y: number) {
      const b = get()?.grid.bodies.find((q) => q.slot === slot);
      if (b) [b.x, b.y] = [x * 16 + 8, y * 16 + 8];
    },
    /** Leaves the charge `ticks` of full charge short of full. */
    manchazoClockCharge(ticksShort: number) {
      const c = get()?.match.ev?.clock;
      if (c) c.charge = CLOCK_FULL - 9 * ticksShort;
    },
  };
}
