import { describe, expect, it } from 'vitest';
import { FINAL_TICKS, paintTile } from '../../sim';
import { give, hand, plus, press, put, shot, sround, stain, tick } from './shot-drive';

const FLY = 12 + 19; // aim + flight to a rival 4 tiles away

function duel(kind: 'glue' | 'swap' | 'dizzy', extra = {}) {
  const s = sround([0, 1], 5, extra);
  put(s, 0, 5, 0);
  put(s, 1, 9, 0);
  s.match.bodies[0]!.face = 0;
  give(s, 0, kind);
  return s;
}

describe('with Rescue and Loot: a stain on the shooter', () => {
  it('during the aim, the card falls as loot (nothing flies); the aim is gone', () => {
    const s = duel('dizzy', { rescue: true });
    tick(s, press(0), 5);
    s.match.pinatas.push({ id: 99, x: 5, y: 0, team: 1, owner: 1, fuse: 1, radius: 2 });
    tick(s);
    expect(hand(s, 0)).toBeNull();
    expect(s.match.res!.loot.map((l) => l.kind)).toEqual(['dizzy']);
    tick(s, {}, 60);
    expect(shot(s).shots).toHaveLength(0);
    expect(plus(s).dizzy[1]).toBe(0);
  });
  it('after the shot left, the shot goes on and hits, and the stain drops nothing (the hand is empty)', () => {
    const s = duel('dizzy', { rescue: true });
    tick(s, press(0), 12 + 3);
    s.match.pinatas.push({ id: 99, x: 5, y: 0, team: 1, owner: 1, fuse: 1, radius: 2 });
    tick(s);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    expect(s.match.res!.loot).toHaveLength(0);
    tick(s, {}, 40);
    expect(plus(s).dizzy[1]).toBeGreaterThan(0);
  });
  it('a stained rival being rescued is not a target: the shot crosses it', () => {
    const s = duel('dizzy', { rescue: true });
    stain(s, 1);
    tick(s, press(0), 60);
    expect(plus(s).dizzy[1]).toBe(0);
  });
  it('a Cambiazo that takes a rival away from the teammate that was freeing it restarts that rescue count', () => {
    const s = sround([0, 1, 1], 5, { rescue: true });
    put(s, 0, 5, 0);
    put(s, 1, 9, 0); // the target, standing next to its stained teammate
    put(s, 2, 10, 0);
    s.match.bodies[0]!.face = 0;
    give(s, 0, 'swap');
    tick(s, press(0), 12 + 10);
    stain(s, 2); // stained just before the shot lands: the rescue count is running
    tick(s, {}, 6);
    expect(s.match.res!.contact[2]).toBeGreaterThan(0);
    tick(s, {}, 4);
    expect(s.grid.bodies[1]!.x).toBe(5 * 16 + 8); // swapped away
    expect(s.match.res!.contact[2]).toBe(0);
  });
});

describe("with the acts: the Final's +1 reaches a Pegote thrown before it, once", () => {
  const finalRound = (ticksToFinal: number) => {
    const s = duel('glue', { events: true, phases: true });
    s.match.ev!.next = s.match.ev!.program.length; // no scheduled event
    s.grid.tick = s.grid.durationTicks - FINAL_TICKS - ticksToFinal;
    return s;
  };
  it('launched in the Scramble and landing after the Final began: radius 3 (2 + 1), not 4', () => {
    const s = finalRound(20);
    tick(s, press(0), FLY);
    expect(s.match.ph!.phase).toBe('final');
    expect(s.match.pinatas[0]!.radius).toBe(3);
  });
  it('landing in the Scramble and still on the body when the Final comes: it grows by 1 once', () => {
    const s = finalRound(FLY + 5);
    tick(s, press(0), FLY);
    expect(s.match.pinatas[0]!.radius).toBe(2);
    tick(s, {}, 10);
    expect(s.match.ph!.phase).toBe('final');
    expect(s.match.pinatas[0]!.radius).toBe(3);
  });
  it("a pass in the Final takes the passer's radius with the Final's +1 (3, not 4)", () => {
    const s = finalRound(0);
    s.match.ph!.phase = 'final';
    s.match.pinatas.push({ id: 7, x: 9, y: 0, team: 0, owner: 0, fuse: 100, radius: 3, mod: 'glue', stuck: 1, passes: 0, lock: 0 });
    put(s, 0, 9, 0);
    tick(s, press(1));
    expect(s.match.pinatas.find((p) => p.id === 7)).toMatchObject({ stuck: 0, team: 1, radius: 3 });
  });
});

describe('with the Hourglass: shots land on bodies in the circle like anywhere else', () => {
  it('a Cambiazo takes the carrier out of the circle and puts the rival in: the charge stops', () => {
    const s = sround([0, 1], 5, { events: true });
    const ev = s.match.ev!;
    ev.next = ev.program.length;
    Object.assign(ev.clock, { phase: 'live', team: 0, row: 7, liveAt: 0, endsAt: 99999, charge: 0 });
    for (let y = 6; y <= 8; y++) for (let x = 12; x <= 14; x++) paintTile(s.match, x, y, 0, 0);
    put(s, 0, 14, 8); // team 0, the loser, loading
    put(s, 1, 18, 8); // the leader, 4 tiles away, facing it
    s.match.bodies[1]!.face = 2;
    give(s, 1, 'swap');
    tick(s, press(1), 10);
    expect(ev.clock.charge).toBeGreaterThan(0);
    tick(s, {}, 25);
    expect(s.grid.bodies[0]!.x).toBe(18 * 16 + 8); // out of the circle
    const charge = ev.clock.charge;
    tick(s, {}, 30);
    expect(ev.clock.charge).toBe(charge); // a rival inside: frozen
  });
});

describe('with the living map: a part that shuts a tile on the shot', () => {
  it('the shot ends one tile back and a Pegote lands there; it never waits for the pair', () => {
    const s = duel('glue', { eventsPlus: true }); // eventsPlus only gives the round its own copy of the map
    put(s, 1, 20, 0);
    tick(s, press(0), 12 + 12); // the shot is around tile 7
    const p = shot(s).shots[0]!;
    const ahead = p.tx + 1;
    s.grid.map.solid[0 * s.grid.map.w + p.tx] = 1; // the tile it is in shuts
    tick(s);
    expect(shot(s).shots).toHaveLength(0);
    expect(shot(s).log.at(-1)).toMatchObject({ kind: 'miss', x: p.lx, y: 0 });
    expect(s.match.pinatas).toHaveLength(1);
    expect(s.match.pinatas[0]).toMatchObject({ x: p.lx, y: 0 });
    expect(ahead).toBeGreaterThan(p.tx);
  });
  it('a Pegote riding a body keeps the pair waiting, as any pinata does (the push rule is unchanged)', () => {
    const s = duel('glue');
    tick(s, press(0), FLY);
    expect(s.match.pinatas[0]).toMatchObject({ stuck: 1 });
  });
});

describe('two rival shots', () => {
  it('meeting on the middle line cancel each other (mirror pure): nobody is hit and both are logged', () => {
    const s = sround([0, 1]);
    put(s, 0, 9, 0);
    put(s, 1, 17, 0); // the mirror tile (26 - 9)
    s.match.bodies[0]!.face = 0;
    s.match.bodies[1]!.face = 2;
    give(s, 0, 'dizzy');
    give(s, 1, 'dizzy');
    tick(s, { ...press(0), ...press(1) }, 12 + 30);
    expect(shot(s).shots).toHaveLength(0);
    expect(shot(s).log.filter((e) => e.kind === 'clash')).toHaveLength(2);
    expect(shot(s).log.filter((e) => e.kind === 'hit')).toHaveLength(0);
    expect(plus(s).dizzy).toEqual([0, 0]);
  });
  it('two shots of the same team cross each other without touching', () => {
    const s = sround([0, 0, 1]);
    put(s, 0, 4, 0);
    put(s, 1, 8, 0);
    put(s, 2, 14, 0);
    s.match.bodies[0]!.face = 0;
    s.match.bodies[1]!.face = 0;
    give(s, 0, 'dizzy');
    give(s, 1, 'dizzy');
    tick(s, { ...press(0), ...press(1) }, 80);
    expect(shot(s).log.filter((e) => e.kind === 'clash')).toHaveLength(0);
    expect(plus(s).dizzy[2]).toBeGreaterThan(0);
  });
  it('two Cambiazos on one rival: the lowest shooter trades, the other is lost', () => {
    const s = sround([0, 1, 0]);
    put(s, 0, 4, 0);
    put(s, 2, 4, 14);
    put(s, 1, 9, 0);
    s.match.bodies[0]!.face = 0;
    give(s, 0, 'swap');
    give(s, 2, 'swap');
    s.match.bodies[2]!.face = 0;
    put(s, 1, 9, 0);
    tick(s, { ...press(0), ...press(2) }, 12 + 40);
    expect(s.grid.bodies[0]!.x).toBe(9 * 16 + 8);
    expect(shot(s).log.filter((e) => e.kind === 'hit')).toHaveLength(1);
  });
});
