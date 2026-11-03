import { describe, expect, it } from 'vitest';
import { newTracker, track, type Watched } from './tracker';

const world = (o: Partial<{ pin: number[]; stun: number[]; held: (string | null)[]; log: string[] }> = {}): Watched => ({
  grid: { bodies: [{}, {}] },
  match: {
    pinatas: (o.pin ?? []).map((id) => ({ id })),
    bodies: (o.stun ?? [0, 0]).map((stun) => ({ stun })),
    sab: { held: o.held ?? [null, null] },
    ev: { log: (o.log ?? []).map((kind) => ({ kind })) },
  },
});

describe('state -> one-shots', () => {
  it('a new pinata lights the fuse; it going away pops', () => {
    const t = newTracker(world());
    expect(track(t, world({ pin: [1] }))).toEqual(['pinata-fuse']);
    expect(track(t, world({ pin: [1] }))).toEqual([]);
    expect(track(t, world({ pin: [] }))).toEqual(['pinata-pop']);
  });
  it('a chain of pinatas going off at once is one pop', () => {
    const t = newTracker(world({ pin: [1, 2, 3] }));
    expect(track(t, world())).toEqual(['pinata-pop']);
  });
  it('a body that gets stained plays "stained" once, not every frame', () => {
    const t = newTracker(world());
    expect(track(t, world({ stun: [0, 40] }))).toEqual(['stained']);
    expect(track(t, world({ stun: [0, 39] }))).toEqual([]);
    expect(track(t, world({ stun: [0, 0] }))).toEqual([]);
    expect(track(t, world({ stun: [5, 0] }))).toEqual(['stained']);
  });
  it('picking up a sabotage (empty hand -> card) plays pickup; using it does not', () => {
    const t = newTracker(world());
    expect(track(t, world({ held: ['glue', null] }))).toEqual(['pickup']);
    expect(track(t, world({ held: [null, null] }))).toEqual([]);
  });
  it('an event announcement alerts; "overtime" is the TIEMPO EXTRA stinger; a change of act is left to its cue', () => {
    const t = newTracker(world());
    expect(track(t, world({ log: ['rain'] }))).toEqual(['event-alert']);
    expect(track(t, world({ log: ['rain', 'overtime'] }))).toEqual(['stinger-tiempo-extra']);
    expect(track(t, world({ log: ['rain', 'overtime', 'warnScramble', 'phaseFinal'] }))).toEqual([]);
  });
  it('the first state is only a baseline: what was already there is not news', () => {
    const t = newTracker(world({ pin: [1], stun: [9, 0], held: ['fan', null], log: ['rain'] }));
    expect(track(t, world({ pin: [1], stun: [9, 0], held: ['fan', null], log: ['rain'] }))).toEqual([]);
  });
});
