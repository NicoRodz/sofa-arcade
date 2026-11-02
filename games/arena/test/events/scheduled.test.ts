import { describe, expect, it } from 'vitest';
import {
  BIG_RADIUS,
  BIG_WARN_TICKS,
  BIG_WAIT_TICKS,
  GOLD_TICKS,
  RAIN_TICKS,
  VACUUM_STEP_TICKS,
  blastTiles,
  type ManchazoState,
} from '../../sim';
import { DROP, put } from '../match-drive';
import { MAP_W, evRound, only, paintRect, recount, run } from './ev-drive';

const ev = (s: ManchazoState) => s.match.ev!;
const log = (s: ManchazoState) => ev(s).log.map((a) => a.kind);

describe('big pinata', () => {
  it('is announced, lands on the middle after 3 s and explodes big for the team that takes it, staining the rival in the blast', () => {
    const s = only(evRound(), 'bigPinata', 10);
    run(s, 11);
    expect(log(s)).toEqual(['bigPinata']); // the TV announcement
    expect(ev(s).big).toMatchObject({ x: 13, y: 7, landAt: 10 + BIG_WARN_TICKS });
    put(s, 0, 13, 7); // standing on it while it is still falling: nothing yet
    put(s, 1, 12, 9);
    run(s, BIG_WARN_TICKS - 2); // tick 189: one before it lands
    expect(s.match.pinatas).toHaveLength(0);
    run(s, 2); // lands: the team on the tile takes it
    expect(s.match.pinatas).toHaveLength(1);
    expect(s.match.pinatas[0]).toMatchObject({ team: 0, radius: BIG_RADIUS, owner: -1 });
    run(s, 40);
    expect(s.match.pinatas).toHaveLength(0);
    expect(s.match.counts[0]).toBe(blastTiles(13, 7, BIG_RADIUS, s.grid.map).length); // radius 5: far more than the usual 13
    expect(s.match.bodies[1]!.stun).toBeGreaterThan(0); // the rival at distance 3 is stained
    expect(ev(s).active).toBeNull();
  });
  it('goes to the other team when the other team steps on it; a tie on the tile leaves it waiting; nobody for 9 s and it is gone', () => {
    const t1 = only(evRound(), 'bigPinata', 5);
    put(t1, 1, 13, 7);
    put(t1, 0, 2, 2);
    run(t1, 5 + BIG_WARN_TICKS + 2);
    expect(t1.match.pinatas[0]!.team).toBe(1);
    const tie = only(evRound(3, [0, 1, 0, 1]), 'bigPinata', 5);
    put(tie, 0, 13, 7);
    put(tie, 1, 13, 7);
    put(tie, 2, 2, 2);
    put(tie, 3, 24, 2);
    run(tie, 5 + BIG_WARN_TICKS + 30);
    expect(tie.match.pinatas).toHaveLength(0);
    expect(ev(tie).active?.kind).toBe('bigPinata');
    put(tie, 0, 2, 12); // the team 0 body leaves: the other one takes it
    run(tie, 1);
    expect(tie.match.pinatas[0]!.team).toBe(1);
    const nobody = only(evRound(), 'bigPinata', 5);
    run(nobody, 5 + BIG_WARN_TICKS + BIG_WAIT_TICKS + 2);
    expect(nobody.match.pinatas).toHaveLength(0);
    expect(ev(nobody).active).toBeNull();
    expect(ev(nobody).big).toBeNull();
  });
});

describe('rain', () => {
  it('washes the band out little by little, a drop and its mirror image together, and leaves the rest alone', () => {
    const s = only(evRound(), 'rain', 0, { row: 6 });
    paintRect(s, 0, 0, 3, 13, 11);
    paintRect(s, 1, 14, 3, 26, 11);
    const before = s.match.counts.reduce((a, b) => a + b, 0);
    const outside = (y: number) => y < 6 || y > 8;
    run(s, RAIN_TICKS / 2);
    const mid = s.match.counts.reduce((a, b) => a + b, 0);
    expect(mid).toBeLessThan(before);
    expect(mid).toBeGreaterThan(before - 100);
    run(s, 1);
    expect(s.match.counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(mid); // monotonic
    for (let y = 3; y <= 11; y++)
      for (let x = 0; x < 14; x++) {
        const [l, r] = [s.match.paint[y * MAP_W + x]!, s.match.paint[y * MAP_W + (MAP_W - 1 - x)]!];
        if (x === 13) continue;
        expect(l < 0 ? -1 : 0).toBe(r < 0 ? -1 : 0); // washed together
      }
    run(s, RAIN_TICKS);
    for (let y = 3; y <= 11; y++)
      for (let x = 0; x < MAP_W; x++) {
        const v = s.match.paint[y * MAP_W + x]!;
        if (outside(y)) {
          if (!s.grid.map.solid[y * MAP_W + x]) expect(v).toBe(x < 14 ? 0 : 1); // untouched
        } else expect(v).toBe(-1);
      }
    expect(recount(s, 0)).toBe(s.match.counts[0]);
    expect(recount(s, 1)).toBe(s.match.counts[1]);
    expect(log(s)).toEqual(['rain']);
  });
});

describe('gold zone', () => {
  it('a tile in the zone counts double for 15 s, the ones already painted too, and everything goes back to 1 after', () => {
    const s = only(evRound(), 'gold', 0, { row: 6 }); // columns 10-16, rows 6-8
    paintRect(s, 0, 10, 6, 12, 6); // 3 tiles in the zone, painted before
    paintRect(s, 0, 0, 0, 2, 0); // 3 outside
    expect(s.match.counts[0]).toBe(6);
    run(s, 1);
    expect(log(s)).toEqual(['gold']);
    expect(s.match.zone).toEqual({ x0: 10, x1: 16, y0: 6, y1: 8 });
    expect(s.match.counts[0]).toBe(9); // the 3 inside now weigh 2
    paintRect(s, 1, 14, 8, 14, 8); // one rival tile inside: 2
    paintRect(s, 1, 20, 0, 20, 0); // one outside: 1
    expect(s.match.counts[1]).toBe(3);
    paintRect(s, 1, 10, 6, 10, 6); // takes a golden tile from team 0: -2 for them, +2 for team 1
    expect(s.match.counts).toEqual([7, 5]);
    run(s, GOLD_TICKS);
    expect(s.match.zone).toBeNull();
    expect(s.match.counts[0]).toBe(recount(s, 0));
    expect(s.match.counts[1]).toBe(recount(s, 1));
  });
});

describe('vacuum robot', () => {
  it('walks a column washing three columns, a tile every 20 ticks, and turns back at furniture', () => {
    const s = only(evRound(), 'vacuum', 0, { down: true });
    paintRect(s, 0, 0, 0, 13, 4);
    paintRect(s, 1, 14, 0, 26, 4);
    run(s, 1);
    expect(ev(s).vac).toMatchObject({ x: 13, y: 0, dy: 1 });
    expect([12, 13, 14].map((x) => s.match.paint[x]!)).toEqual([-1, -1, -1]); // row 0 washed at once
    expect(s.match.paint[MAP_W * 0 + 11]).toBe(0);
    run(s, VACUUM_STEP_TICKS * 3);
    expect(ev(s).vac!.y).toBe(3);
    expect([12, 13, 14].map((x) => s.match.paint[3 * MAP_W + x]!)).toEqual([-1, -1, -1]);
    expect(s.match.paint[3 * MAP_W + 11]).toBe(0); // only 3 columns
    run(s, VACUUM_STEP_TICKS * 2); // (13, 4) is furniture: it turns instead of crossing it
    expect(ev(s).vac).toMatchObject({ y: 2, dy: -1 });
  });
  it('a pinata blast deflects it one tile away from the blast; the mirror blast, the other way', () => {
    const at = (bodyX: number, team: number) => {
      const s = only(evRound(3, [0, 1]), 'vacuum', 0);
      run(s, 1);
      Object.assign(ev(s).vac!, { x: 13, y: 7, dy: 1, wait: -100000 }); // parked: only the blast moves it
      put(s, team, bodyX, 7);
      put(s, 1 - team, 2, 12);
      run(s, 1, { [team]: DROP });
      run(s, 125);
      return ev(s).vac!;
    };
    expect(at(11, 0)).toMatchObject({ x: 14, y: 7 }); // blast from the left: pushed right
    expect(at(15, 1)).toMatchObject({ x: 12, y: 7 }); // from the right: pushed left
  });
});
