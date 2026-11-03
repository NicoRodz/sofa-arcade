import { describe, expect, it } from 'vitest';
import { BASE_RADIUS, FINAL_TICKS, RADIUS_CAP, blastTiles, createManchazo, stepManchazo, type ManchazoState } from '../../sim';
import { DROP, put } from '../match-drive';
import { idle, phaseRound, quietEvents, toTick } from './phase-drive';

const drop = (s: ManchazoState, i = 0) => stepManchazo(s, new Map([[s.grid.bodies[i]!.slot, DROP]]));
const finalStart = (s: ManchazoState) => s.grid.durationTicks - FINAL_TICKS;

describe('the Final: +1 of radius, capped at the base radius + 3', () => {
  it('a pinata dropped in the Scramble has the plain radius; one dropped inside the Final has +1', () => {
    const s = quietEvents(phaseRound());
    toTick(s, finalStart(s) - 3);
    put(s, 0, 6, 6);
    drop(s); // runs tick final - 3: Scramble
    expect(s.match.pinatas.map((p) => p.radius)).toEqual([BASE_RADIUS]);
    idle(s, 3); // runs final - 2, final - 1, final: the act turns Final at the end of the last
    expect(s.match.ph!.phase).toBe('final');
    put(s, 0, 10, 10);
    drop(s); // a pinata dropped inside the Final
    expect(s.match.pinatas.map((p) => p.radius)).toEqual([BASE_RADIUS + 1, BASE_RADIUS + 1]);
  });
  it('the pinatas already on the floor when the Final begins grow too (and the paint of the blast follows)', () => {
    const s = quietEvents(phaseRound());
    toTick(s, finalStart(s) - 1);
    put(s, 0, 4, 7);
    drop(s); // fuse 120 left, still alive when the Final begins one tick later
    expect(s.match.pinatas[0]!.radius).toBe(BASE_RADIUS);
    idle(s);
    expect(s.match.pinatas[0]!.radius).toBe(BASE_RADIUS + 1);
    idle(s, 130);
    expect(s.match.counts[0]).toBe(blastTiles(4, 7, BASE_RADIUS + 1, s.grid.map).length);
  });
  it('the small team (+1), the come-back (+1) and the Final (+1) stack but never past the base radius + 3', () => {
    const s = quietEvents(phaseRound([0, 0, 0, 1]));
    expect(s.match.radius).toEqual([BASE_RADIUS, BASE_RADIUS + 1]);
    s.match.ev!.comeback = { team: 1, until: s.grid.durationTicks, cool: 0 }; // team 1 is coming back
    toTick(s, finalStart(s) + 1);
    put(s, 3, 4, 7);
    drop(s, 3);
    expect(s.match.pinatas[0]!.radius).toBe(RADIUS_CAP); // 3 + 1 + 1
    expect(RADIUS_CAP).toBe(BASE_RADIUS + 3);
    s.match.radius[1] = 4; // a bigger edge would give 6: the cap holds it
    put(s, 3, 20, 3);
    idle(s, 10);
    drop(s, 3);
    expect(Math.max(...s.match.pinatas.map((p) => p.radius))).toBe(RADIUS_CAP);
  });
  it('Happy hour on top of the Final does not go past the cap either', () => {
    const s = quietEvents(phaseRound());
    toTick(s, finalStart(s) + 1);
    s.match.ev!.active = { kind: 'happyHour', start: s.grid.tick, end: s.grid.tick + 480 };
    s.match.pinatas.push({ id: 90, x: 13, y: 7, team: 0, owner: -1, fuse: 1, radius: RADIUS_CAP }); // radius 5 + Happy hour's 1 would be 6
    idle(s);
    expect(s.match.counts[0]).toBe(blastTiles(13, 7, RADIUS_CAP, s.grid.map).length);
  });
  it('without the flag nothing grows: the same moment in a round without `phases` has the plain radius and Happy hour still reaches 6', () => {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 3, events: true });
    expect(s.match.ph).toBeNull();
    s.match.ev!.next = s.match.ev!.program.length;
    s.grid.tick = s.grid.durationTicks - 500;
    put(s, 0, 4, 7);
    drop(s);
    expect(s.match.pinatas[0]!.radius).toBe(BASE_RADIUS);
    s.match.ev!.active = { kind: 'happyHour', start: s.grid.tick, end: s.grid.tick + 480 };
    s.match.pinatas.push({ id: 90, x: 13, y: 7, team: 0, owner: -1, fuse: 1, radius: 5 });
    idle(s);
    expect(s.match.counts[0]).toBe(blastTiles(13, 7, 6, s.grid.map).length);
  });
});
