import { describe, expect, it } from 'vitest';
import { ASSIST_REACH_MULT } from './assist';
import { REACH, REACH_SLACK, targetStation, tick } from '../overcooked';
import { createVersusGame } from '../versus/lobby';
import { versusMap } from '../versus/maps';
import { idle, room, CRATE_ROOM, at } from './assist.kit';

describe('reach x1.5 and auto-aim (auto-grab)', () => {
  it('reaches a station the normal chef cannot: the control, at the same spot facing it, gets nothing', () => {
    // 1.5 tiles from the crate's edge: past the usual REACH + SLACK (1.1), inside the Ayudante's 1.65
    const helped = room(CRATE_ROOM, [1]),
      control = room(CRATE_ROOM, []);
    const crate = helped.stations[0]!;
    expect(targetStation(helped, at(helped, 1, 9.5, 4.5))).toBe(crate);
    expect(targetStation(control, at(control, 1, 9.5, 4.5)), 'the control has nothing within reach').toBeNull();
  });
  it('the radius is x1.5 of the usual one: 1.5 x (REACH + REACH_SLACK) from the centre to the tile, not a hair more', () => {
    const g = room(CRATE_ROOM, [1]);
    const crate = g.stations[0]!;
    const R = (REACH + REACH_SLACK) * ASSIST_REACH_MULT;
    expect(R).toBeCloseTo(1.65, 9);
    expect(targetStation(g, at(g, 1, 8 + R - 0.05, 4.5))).toBe(crate);
    expect(targetStation(g, at(g, 1, 8 + R + 0.05, 4.5))).toBeNull();
  });
  it('turns to the station by itself when the stick is idle, and A grabs although the chef was facing away; the control standing there grabs nothing', () => {
    const g = room(CRATE_ROOM, [1]);
    const p = at(g, 1, 9.0, 4.5, 1, 0); // facing away from the crate (+x), 1 tile from its edge
    tick(g, new Map([[1, idle]]));
    expect([Math.round(p.fx) + 0, Math.round(p.fy) + 0], 'faces the crate').toEqual([-1, 0]);
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(p.item).toBe('raw0');
    const c = room(CRATE_ROOM, []);
    at(c, 1, 9.0, 4.5, 1, 0);
    tick(c, new Map([[1, { ...idle, a: 1 }]]));
    expect(c.players.get(1)!.item, 'facing away: nothing').toBeNull();
    expect([c.players.get(1)!.fx, c.players.get(1)!.fy], 'and it did not turn').toEqual([1, 0]);
  });
  it('turns to the CLOSEST point of a station that is off to a side, too (a diagonal one)', () => {
    const g = room(CRATE_ROOM, [1]);
    const p = at(g, 1, 9.0, 5.5, 0, 1); // below-right of the crate (7..8, 4..5), looking down
    tick(g, new Map([[1, idle]]));
    expect(p.fx).toBeLessThan(-0.5);
    expect(p.fy).toBeLessThan(0); // up and to the left: towards the corner (8, 5)
  });
  it('with the stick held the chef keeps facing the stick, not the station (it does not fight the player)', () => {
    const g = room(CRATE_ROOM, [1]);
    const p = at(g, 1, 9.0, 4.5, 1, 0);
    tick(g, new Map([[1, { x: 1, y: 0, a: 0, b: false }]])); // pushing away from the crate
    expect([p.fx, p.fy]).toEqual([1, 0]);
  });
  it('the nearest station wins when it is much nearer, and what the chef faces wins when they are about the same', () => {
    const rows = ['#.....C.C......#', '#..............#'];
    const g = room(rows, [1]);
    const [left, right] = [g.stations.find((s) => s.tx === 6)!, g.stations.find((s) => s.tx === 8)!];
    expect(targetStation(g, at(g, 1, 7.5, 4.5, -1, 0)), 'equal distance, facing left').toBe(left);
    expect(targetStation(g, at(g, 1, 7.5, 4.5, 1, 0)), 'equal distance, facing right').toBe(right);
    expect(
      targetStation(g, at(g, 1, 7.05, 4.5, 1, 0)),
      'practically touching the left one although it faces the right one: the left one',
    ).toBe(left);
    expect(targetStation(g, at(g, 1, 7.95, 4.5, -1, 0)), 'and the other way round').toBe(right);
    expect(
      targetStation(g, at(g, 1, 7.3, 4.5, 1, 0)),
      'a bit closer to the left one but facing the right one: what it faces wins (the facing bonus)',
    ).toBe(right);
    expect(targetStation(g, at(g, 1, 7.7, 4.5, -1, 0))).toBe(left);
  });
  it('never through a wall: a station right behind a wall tile is out of reach, the one in the open is not', () => {
    const rows = ['#.....1#.......#', '#..............#'];
    const g = room(rows, [1]);
    const crate = g.stations[0]!;
    expect(targetStation(g, at(g, 1, 8.6, 4.5, -1, 0)), 'the crate is 1.6 from the chef, behind the wall tile (7, 4)').toBeNull();
    // the same crate with the wall gone is reached from there
    const open = room(['#.....1........#', '#..............#'], [1]);
    expect(targetStation(open, at(open, 1, 8.6, 4.5, -1, 0))).toBe(open.stations[0]);
    expect(crate.kind).toBe('crate');
  });
  it("another kitchen's stations are still not for this chef (versus), whatever the radius", () => {
    const m = versusMap('V1')!;
    const g = createVersusGame({
      teams: [
        { id: 0, name: 'A', color: '#000000', icon: 'a', playerIds: [1] },
        { id: 1, name: 'B', color: '#ffffff', icon: 'b', playerIds: [2] },
      ],
      map: { id: m.id, name: m.name, rows: m.rows, spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]], sigma: m.versus.sigma },
      difficulty: 'normal',
      seed: 3,
      modeOptions: { sabotage: 'off' },
      slotOf: (i) => i - 1,
      assist: [1],
    });
    const p = g.players.get(1)!;
    let used = 0;
    for (let i = 0; i < 600; i++) {
      tick(g, new Map([[1, { x: i < 300 ? 1 : -1, y: 0.4, a: 0, b: false }]]));
      const s = targetStation(g, p);
      if (s) {
        used++;
        expect(s.owner === null || s.owner === 0).toBe(true);
      }
    }
    expect(used, 'it did find stations of its own kitchen').toBeGreaterThan(50);
  });
});
