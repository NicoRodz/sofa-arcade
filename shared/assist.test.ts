// Ayudante (assist.ts): what the profile gives one chef, that it gives nothing to anybody else, and what it costs in the versus handicap.
// Every effect is checked against a control chef (same place, same inputs, no flag) so a green cannot come from the situation being easy.
import { describe, expect, it } from 'vitest';
import { WASH_MS } from './difficulty';
import { ASSIST_IMMUNITY_K, ASSIST_REACH_MULT, ASSIST_WEIGHT, effectiveChefs } from './assist';
import { addFloorItem } from './floor';
import { SCENARIOS as GOLDEN, runGolden } from './golden/bot';
import { DIRS, fixedMap, isFloor } from './maps';
import { REACH, REACH_SLACK, SPEED, TICK_MS, addPlayer, createGame, dropPlayer, targetStation, tick, type Controls, type Game, type Station } from './overcooked';
import { chefHint } from './hints';
import { GAMES, modeOf } from './games';
import { handicapK, matchStatus, teamMultipliers, validateTeamSetup } from './teams';
import { createVersusGame, lobbySetup, startVersusRound } from './versusLobby';
import { versusMap } from './versusMaps';
import n4 from './golden/coop-n4-map9-hard.json';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const MAP = fixedMap('10')!;

/** Two chefs side by side in the same kitchen: 1 plays on Ayudante, 2 is the control. */
function duo(difficulty: 'easy' | 'normal' | 'hard' = 'normal', assist: number[] = [1]) {
  const g = createGame({ mapId: '10', rows: MAP.rows, spawns: MAP.spawns, n: 2, seed: 5, difficulty, assist });
  addPlayer(g, 1, 0); addPlayer(g, 2, 1);
  return g;
}
const station = (g: Game, kind: string, n = 0) => g.stations.filter((s) => s.kind === kind)[n]!;
/** Puts chef `id` next to `s` (on the open tile), `gap` tiles further away than touching, facing `dir` ('to' = the station, 'away' = the opposite way). */
function place(g: Game, id: number, s: Station, o: { gap?: number; dir?: 'to' | 'away' } = {}) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([x, y]) => isFloor(g.grid, s.tx + x, s.ty + y) && isFloor(g.grid, s.tx + 2 * x, s.ty + 2 * y))!; // a free tile and one more behind it
  const gap = o.gap ?? 0;
  Object.assign(p, { x: s.tx + dx * (1 + gap) + 0.5, y: s.ty + dy * (1 + gap) + 0.5, fx: o.dir === 'away' ? dx : -dx, fy: o.dir === 'away' ? dy : -dy, vx: 0, vy: 0 });
  return [dx, dy] as const;
}
const run = (g: Game, ms: number, c: Map<number, Controls> = new Map()) => { for (let t = 0; t < ms; t += TICK_MS) tick(g, c); };

describe('the flag is per chef and costs nothing when it is off', () => {
  it('a round that names an Ayudante nobody plays (or nobody at all) is the golden round, event for event', () => {
    const sc = GOLDEN.find((x) => x.name === n4.name)!;
    const want = runGolden(sc);
    const none = runGolden({ ...sc, assist: [] });
    const ghost = runGolden({ ...sc, assist: [99] });
    expect(none).toEqual(want);
    expect(ghost).toEqual(want);
    expect(want.events.length).toBeGreaterThan(500);
  });
  it('the same round with a real Ayudante is NOT the golden one (the control proves the flag does something) but still cooks and delivers', () => {
    const sc = GOLDEN.find((x) => x.name === n4.name)!;
    const with1 = runGolden({ ...sc, assist: [1] });
    expect(with1.events).not.toEqual(runGolden(sc).events);
    expect(with1.delivered).toBeGreaterThan(0);
  });
  it('only the chef that chose it carries the flag, and the roster knows', () => {
    const g = duo();
    expect(g.players.get(1)!.assist).toBe(true);
    expect(g.players.get(2)!.assist).toBeUndefined();
    expect('chopLatch' in g.players.get(2)!).toBe(false);
    expect(g.roster.map((r) => !!r.assist)).toEqual([true, false]);
  });
});

// Small purpose-built rooms (16 x 9): the situation is exactly what the test says, not whatever a fixed map happens to have around.
const WALLS = ['################', '#..............#', '#..............#', '#..............#'];
const room = (mid: string[], assist: number[], o: { hazards?: boolean; difficulty?: 'easy' | 'normal' | 'hard' } = {}) => {
  const rows = [...WALLS, ...mid, ...WALLS.slice(0, 3).reverse()].slice(0, 9);
  const g = createGame({ rows, spawns: [[2, 2], [3, 2]], n: 2, seed: 5, difficulty: o.difficulty ?? 'normal', assist, hazards: o.hazards });
  addPlayer(g, 1, 0); addPlayer(g, 2, 1);
  return g;
};
const CRATE_ROOM = ['#......1.......#', '#..............#']; // rows 4-5: one crate at (7, 4) in open floor
const at = (g: Game, id: number, x: number, y: number, fx = -1, fy = 0) => { const p = g.players.get(id)!; Object.assign(p, { x, y, fx, fy, vx: 0, vy: 0 }); return p; };

describe('reach x1.5 and auto-aim (auto-grab)', () => {
  it('reaches a station the normal chef cannot: the control, at the same spot facing it, gets nothing', () => {
    // 1.5 tiles from the crate's edge: past the usual REACH + SLACK (1.1), inside the Ayudante's 1.65
    const helped = room(CRATE_ROOM, [1]), control = room(CRATE_ROOM, []);
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
    expect(p.fx).toBeLessThan(-0.5); expect(p.fy).toBeLessThan(0); // up and to the left: towards the corner (8, 5)
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
    expect(targetStation(g, at(g, 1, 7.05, 4.5, 1, 0)), 'practically touching the left one although it faces the right one: the left one').toBe(left);
    expect(targetStation(g, at(g, 1, 7.95, 4.5, -1, 0)), 'and the other way round').toBe(right);
    expect(targetStation(g, at(g, 1, 7.3, 4.5, 1, 0)), 'a bit closer to the left one but facing the right one: what it faces wins (the facing bonus)').toBe(right);
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
    const g = createVersusGame({ teams: [{ id: 0, name: 'A', color: '#000000', icon: 'a', playerIds: [1] }, { id: 1, name: 'B', color: '#ffffff', icon: 'b', playerIds: [2] }], map: { id: m.id, name: m.name, rows: m.rows, spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]], sigma: m.versus.sigma }, difficulty: 'normal', seed: 3, modeOptions: { sabotage: 'off' }, slotOf: (i) => i - 1, assist: [1] });
    const p = g.players.get(1)!;
    let used = 0;
    for (let i = 0; i < 600; i++) { tick(g, new Map([[1, { x: i < 300 ? 1 : -1, y: 0.4, a: 0, b: false }]])); const s = targetStation(g, p); if (s) { used++; expect(s.owner === null || s.owner === 0).toBe(true); } }
    expect(used, 'it did find stations of its own kitchen').toBeGreaterThan(50);
  });
});

describe('no inertia', () => {
  it('on Normal (where the stick is smoothed) the Ayudante is at full speed after ONE tick, the control is still accelerating', () => {
    const g = duo('normal');
    const open = (id: number) => { const p = g.players.get(id)!; Object.assign(p, { x: 7.5 + id, y: 4.5, vx: 0, vy: 0 }); return p; };
    const a = open(1), c = open(2);
    tick(g, new Map([[1, { x: 1, y: 0, a: 0, b: false }], [2, { x: 1, y: 0, a: 0, b: false }]]));
    expect(a.vx).toBeCloseTo(SPEED, 6);
    expect(c.vx, 'control').toBeLessThan(SPEED * 0.9);
    expect(c.vx).toBeGreaterThan(0);
  });
  it('and stops dead the tick the stick is released', () => {
    const g = duo('normal');
    const a = g.players.get(1)!, c = g.players.get(2)!;
    Object.assign(a, { x: 8.5, y: 4.5 }); Object.assign(c, { x: 9.5, y: 4.5 });
    run(g, 200, new Map([[1, { x: 1, y: 0, a: 0, b: false }], [2, { x: 1, y: 0, a: 0, b: false }]]));
    tick(g, new Map([[1, idle], [2, idle]]));
    expect(a.vx).toBe(0);
    expect(c.vx, 'control keeps sliding a moment').toBeGreaterThan(0);
  });
});

describe('one-tap chopping', () => {
  const setup = (assist: number[]) => {
    const g = duo('normal', assist);
    const board = station(g, 'board');
    board.item = 'raw1';
    const [dx, dy] = place(g, 1, board); // (dx, dy): from the board to the chef
    return { g, board, p: g.players.get(1)!, cutMs: g.params.cutMs, into: [-dx, -dy] as const, side: [-dy, dx] as const };
  };
  const tap = { ...idle, bTaps: 1 };
  it('a tap starts the cut and it keeps going without holding B until the tomato is chopped; one chopDone, then it stops by itself', () => {
    const { g, board, p, cutMs } = setup([1]);
    const events: string[] = [];
    g.bus.on('chopStart', () => events.push('start')); g.bus.on('chopDone', () => events.push('done')); g.bus.on('chopStop', () => events.push('stop'));
    tick(g, new Map([[1, tap]]));
    expect(p.cutting).toBe(true);
    run(g, cutMs / 2, new Map([[1, idle]])); // B is up the whole time
    expect(p.cutting, 'still chopping with B released').toBe(true);
    expect(board.progress).toBeGreaterThan(0.3);
    run(g, cutMs, new Map([[1, idle]]));
    expect(board.item).toBe('cut1');
    expect(p.cutting).toBe(false);
    expect(p.chopLatch).toBe(false);
    expect(events).toEqual(['start', 'done', 'stop']);
  });
  it('the control: the same tap does nothing for a normal chef (a cut needs B held)', () => {
    const { g, board, p } = setup([]);
    tick(g, new Map([[1, tap]]));
    run(g, 400, new Map([[1, idle]]));
    expect(p.cutting).toBe(false);
    expect(board.progress).toBe(0);
  });
  it('the stick ends it (walking away stops the chop); a light touch on the stick does not', () => {
    const { g, board, p } = setup([1]);
    tick(g, new Map([[1, tap]]));
    run(g, 100, new Map([[1, { x: 0.2, y: 0, a: 0, b: false }]]));
    expect(p.cutting, 'a drifting thumb does not cancel').toBe(true);
    const progress = board.progress;
    run(g, 100, new Map([[1, { x: -0.9, y: 0, a: 0, b: false }]]));
    expect(p.cutting).toBe(false);
    expect(board.progress).toBe(progress); // nothing was chopped while walking off
    expect(p.chopLatch).toBe(false);
    run(g, 300, new Map([[1, idle]]));
    expect(board.progress, 'and it does not resume by itself when the thumb comes back to rest').toBe(progress);
  });
  it('pushing the stick INTO the board (to be sure of facing it) is not walking away: it keeps chopping; sideways and away end it', () => {
    for (const [name, pick, keeps] of [
      ['into the board', (o: ReturnType<typeof setup>) => [o.into[0], o.into[1]], true],
      ['diagonal into it', (o: ReturnType<typeof setup>) => [0.8 * o.into[0] + 0.6 * o.side[0], 0.8 * o.into[1] + 0.6 * o.side[1]], true],
      ['sideways', (o: ReturnType<typeof setup>) => [o.side[0], o.side[1]], false],
      ['away', (o: ReturnType<typeof setup>) => [-o.into[0], -o.into[1]], false],
    ] as const) {
      const o = setup([1]);
      const [x, y] = pick(o);
      tick(o.g, new Map([[1, tap]]));
      run(o.g, 100, new Map([[1, { x: x!, y: y!, a: 0, b: false }]]));
      expect(o.p.cutting, name).toBe(keeps);
    }
  });
  it('a tap where there is nothing to cut starts nothing (no latch waiting to surprise a later station)', () => {
    const { g, board, p } = setup([1]);
    board.item = null;
    tick(g, new Map([[1, tap]]));
    expect(p.cutting).toBe(false);
    expect(p.chopLatch).toBeFalsy();
    board.item = 'raw1';
    tick(g, new Map([[1, idle]]));
    expect(p.cutting, 'it had not latched').toBe(false);
  });
  it('taking the item off the board (A) ends it; the washing at a sink is the same one-tap', () => {
    const { g, board, p } = setup([1]);
    tick(g, new Map([[1, tap]]));
    run(g, 100, new Map([[1, idle]]));
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(p.item).toBe('raw1');
    expect(board.item).toBeNull();
    tick(g, new Map([[1, idle]]));
    expect(p.cutting).toBe(false);
    const g2 = duo('normal', [1]);
    const sink = station(g2, 'sink');
    sink.count = 2;
    place(g2, 1, sink);
    tick(g2, new Map([[1, tap]]));
    run(g2, WASH_MS + 300, new Map([[1, idle]]));
    expect(sink.clean, 'a plate was washed without holding B').toBeGreaterThanOrEqual(1);
  });
  it('a dropped phone stops its chop', () => {
    const g = createVersusGame({ teams: [{ id: 0, name: 'A', color: '#000000', icon: 'a', playerIds: [1] }, { id: 1, name: 'B', color: '#ffffff', icon: 'b', playerIds: [2] }], map: (() => { const m = versusMap('V1')!; return { id: m.id, name: m.name, rows: m.rows, spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]], sigma: m.versus.sigma }; })(), difficulty: 'normal', seed: 3, modeOptions: { sabotage: 'off' }, slotOf: (i) => i - 1, assist: [1] });
    const p = g.players.get(1)!;
    const board = g.stations.find((s) => s.kind === 'board' && s.owner === 0)!;
    board.item = 'raw1';
    place(g, 1, board);
    tick(g, new Map([[1, tap]]));
    expect(p.cutting).toBe(true);
    dropPlayer(g, 1);
    expect([p.cutting, p.chopLatch]).toEqual([false, false]);
  });
});

describe('immune to the banana-skin', () => {
  const walkOver = (assist: number[]) => {
    const g = room(['#..............#', '#..............#'], assist, { hazards: true });
    const slips: number[] = [];
    g.bus.on('chef:slip', (e) => slips.push(e.chef));
    const p = at(g, 1, 8.6, 5.5, 1, 0);
    addFloorItem(g, { tx: 10, ty: 5, item: 'trash', kind: 'trash', team: 0, by: 1 });
    run(g, 700, new Map([[1, { x: 1, y: 0, a: 0, b: false }]]));
    return { g, p, slips };
  };
  it('walking over rubbish: the control slips (once), the Ayudante does not, with the same rubbish and the same walk', () => {
    const control = walkOver([]), helped = walkOver([1]);
    expect(control.slips, 'the control slips').toEqual([1]);
    expect(control.p.immuneUntil).toBeGreaterThan(0);
    expect(helped.slips).toEqual([]);
    expect(helped.p.slip ?? null).toBeNull();
    expect(helped.p.immuneUntil, 'never marked immune: it just does not slip').toBeUndefined();
    expect(helped.p.x, 'it kept walking past the rubbish').toBeGreaterThan(11);
  });
  it('standing on it, or having it land at its feet, is no different', () => {
    const g = room(['#..............#', '#..............#'], [1], { hazards: true });
    const p = at(g, 1, 10.5, 5.5);
    addFloorItem(g, { tx: 10, ty: 5, item: 'trash', kind: 'trash', team: 0, by: 1 });
    run(g, 300, new Map());
    expect(p.slip ?? null).toBeNull();
  });
  it('the chef keeps what it carries (it would have dropped it) and the rubbish stays on the floor for the team to clean', () => {
    const g = room(['#..............#', '#..............#'], [1], { hazards: true });
    const p = at(g, 1, 8.6, 5.5, 1, 0);
    p.item = 'raw1';
    addFloorItem(g, { tx: 10, ty: 5, item: 'trash', kind: 'trash', team: 0, by: 1 });
    run(g, 700, new Map([[1, { x: 1, y: 0, a: 0, b: false }]]));
    expect(p.item).toBe('raw1');
    expect(g.floor.filter((f) => f.kind === 'trash')).toHaveLength(1);
  });
  it('the hint of a chef on Ayudante near rubbish says "Recoger" (it can still clean) and never "Sin control"', () => {
    const g = room(['#..............#', '#..............#'], [1], { hazards: true });
    const p = at(g, 1, 9.5, 5.5, 1, 0);
    addFloorItem(g, { tx: 10, ty: 5, item: 'trash', kind: 'trash', team: 0, by: 1 });
    expect(chefHint(g, p).a).toBe('Recoger');
  });
});

describe('the handicap k (versus): an Ayudante weighs 0.7 and its immunity costs 0.05 of k  [numbers to calibrate]', () => {
  it('with no Ayudantes every k is what it always was (the old table: 2v1 1.41, 3v2 1.22, 4v3 1.15)', () => {
    for (const [counts, want] of [[[2, 2], [1, 1]], [[2, 1], [1, 1.41]], [[3, 2], [1, 1.22]], [[4, 3], [1, 1.15]]] as const) {
      expect(teamMultipliers(counts, Infinity)).toEqual(want);
      expect(teamMultipliers(counts, Infinity, [0, 0])).toEqual(want);
      expect(teamMultipliers(counts, Infinity, undefined)).toEqual(want);
    }
    expect(handicapK(2, 3)).toBe(Math.max(1, Math.round(Math.sqrt(3 / 2) * 100) / 100));
  });
  it('the constants are the council\'s, written down as numbers to calibrate', () => {
    expect([ASSIST_WEIGHT, ASSIST_IMMUNITY_K, ASSIST_REACH_MULT]).toEqual([0.7, 0.05, 1.5]);
    expect(effectiveChefs(3, 0)).toBe(3);
    expect(effectiveChefs(3, 1)).toBeCloseTo(2.7, 9);
  });
  it('2 v 2 with one Ayudante in team 0: its team gets sqrt(2/1.7) = 1.08 minus 0.05 = 1.03; the other stays at 1', () => {
    expect(teamMultipliers([2, 2], Infinity, [1, 0])).toEqual([1.03, 1]);
    expect(teamMultipliers([2, 2], Infinity, [0, 1])).toEqual([1, 1.03]);
  });
  it('two Ayudantes in the same team of 2 (eff 1.4 vs 2): sqrt(2/1.4) = 1.20 minus 0.10 = 1.10', () => {
    expect(teamMultipliers([2, 2], Infinity, [2, 0])).toEqual([1.1, 1]);
  });
  it('an Ayudante on the BIGGER team of an uneven match: 3 v 2, 1 Ayudante among the 3 -> eff 2.7 v 2: the three get 1 (floor), the two get sqrt(2.7/2) = 1.16', () => {
    expect(teamMultipliers([3, 2], Infinity, [1, 0])).toEqual([1, 1.16]);
  });
  it('k never drops below 1, and the legal split is still judged on the real counts (3v1 stays refused)', () => {
    expect(teamMultipliers([3, 3], 2, [3, 0])!.every((k) => k >= 1)).toBe(true);
    expect(teamMultipliers([3, 1], 2, [0, 1])).toBeNull();
  });
  it('the sim applies it: createGame / startVersusRound with an Ayudante gives the team its k, and the lobby shows the same number before the start', () => {
    const versus = modeOf(GAMES[0], 'versus');
    const teams = [{ id: 0, name: 'A', color: '#000000', icon: 'a', playerIds: [1, 3] }, { id: 1, name: 'B', color: '#ffffff', icon: 'b', playerIds: [2, 4] }];
    const lobby = lobbySetup(versus, teams, new Set([1]));
    expect(lobby.k).toEqual([1.03, 1]);
    expect(lobbySetup(versus, teams).k, 'without the set: as before').toEqual([1, 1]);
    expect(lobbySetup(versus, teams, new Set()).k).toEqual([1, 1]);
    const round = startVersusRound({ teams, choice: 'V1', difficulty: 'normal', seed: 3, modeOptions: { handicap: true, sabotage: 'off' }, slotOf: (i) => i - 1, rand: () => 0.1, assist: [1] });
    expect(round.game.teams.map((t) => t.k)).toEqual(lobby.k);
    const plain = startVersusRound({ teams, choice: 'V1', difficulty: 'normal', seed: 3, modeOptions: { handicap: true, sabotage: 'off' }, slotOf: (i) => i - 1, rand: () => 0.1 });
    expect(plain.game.teams.map((t) => t.k)).toEqual([1, 1]);
    // the handicap option off: nothing is applied whoever plays on Ayudante
    const off = startVersusRound({ teams, choice: 'V1', difficulty: 'normal', seed: 3, modeOptions: { handicap: false, sabotage: 'off' }, slotOf: (i) => i - 1, rand: () => 0.1, assist: [1] });
    expect(off.game.teams.map((t) => t.k)).toEqual([1, 1]);
    expect(validateTeamSetup(versus, [[1, 3], [2, 4]], new Set([1])).k).toEqual([1.03, 1]);
  });
  it('a score is multiplied by that k (a delivery is worth 3% more for the team with the Ayudante)', () => {
    const teams = [{ id: 0, name: 'A', color: '#000000', icon: 'a', playerIds: [1, 3] }, { id: 1, name: 'B', color: '#ffffff', icon: 'b', playerIds: [2, 4] }];
    const gain = (assist: number[]) => {
      const g = startVersusRound({ teams, choice: 'V1', difficulty: 'normal', seed: 3, modeOptions: { handicap: true, sabotage: 'off' }, slotOf: (i) => i - 1, rand: () => 0.1, assist }).game;
      const p = g.players.get(1)!;
      const w = g.stations.find((s) => s.kind === 'window' && s.owner === 0)!;
      place(g, 1, w);
      p.item = 'dish';
      let got = 0;
      g.bus.on('delivered', (e) => { got = e.points; });
      g.countdown = 0;
      tick(g, new Map([[1, { ...idle, a: 1 }]]));
      return got;
    };
    const base = gain([]), helped = gain([1]);
    expect(base).toBeGreaterThan(0);
    expect(helped).toBe(Math.round((base / 1) * 1.03));
  });
  it('drops follow the Ayudantes: when the Ayudante of a team leaves for good, k is recomputed without it (matchStatus)', () => {
    const roster = [{ id: 1, teamId: 0, droppedAt: null, assist: true as const }, { id: 3, teamId: 0, droppedAt: null }, { id: 2, teamId: 1, droppedAt: null }, { id: 4, teamId: 1, droppedAt: null }];
    expect(matchStatus([0, 1], roster, 0, 'score-k').k).toEqual([1.03, 1]);
    const gone = roster.map((r) => (r.id === 1 ? { ...r, droppedAt: 0 } : r));
    const st = matchStatus([0, 1], gone, 25_000, 'score-k'); // past the grace time: the chef is gone
    expect(st.counts).toEqual([1, 2]);
    expect(st.k).toEqual([1.41, 1]);
  });
});
