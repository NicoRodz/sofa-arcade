import { describe, expect, it } from 'vitest';
import { ACTIONS, LOOPS, SFX, sfxDuration, type Action } from './recipes';

const ids = (a: Action[]) => a.map((x) => (x.kind === 'play' ? x.id : x.kind));

describe('event -> sound mapping', () => {
  it('grab, drop and invalid map to their sounds', () => {
    expect(ids(ACTIONS.itemPicked({ player: 1, item: 'raw0', from: 'crate' }))).toEqual(['pickup']);
    expect(ids(ACTIONS.itemDropped({ player: 1, item: 'raw0', at: 'counter' }))).toEqual(['drop']);
    expect(ids(ACTIONS.interactInvalid({ player: 1 }))).toEqual(['buzz']);
  });
  it('chopping loops per station while held and ends with a ding', () => {
    expect(ACTIONS.chopStart({ player: 1, station: 4 })).toEqual([{ kind: 'loopStart', key: 'chop:4', loop: 'chop' }]);
    expect(ACTIONS.chopStop({ player: 1, station: 4 })).toEqual([{ kind: 'loopStop', key: 'chop:4' }]);
    expect(ACTIONS.chopDone({ player: 1, station: 4 })).toEqual([{ kind: 'loopStop', key: 'chop:4' }, { kind: 'play', id: 'ding' }]);
  });
  it('oven: start plays the swell and loops crackle until ready', () => {
    expect(ACTIONS.potStart({ station: 2 })).toEqual([{ kind: 'play', id: 'ovenOn' }, { kind: 'loopStart', key: 'oven:2', loop: 'oven' }]);
    expect(ACTIONS.potReady({ station: 2 })).toEqual([{ kind: 'loopStop', key: 'oven:2' }, { kind: 'play', id: 'ready' }]);
  });
  it('orders and delivery; only a delivery ducks the music', () => {
    expect(ids(ACTIONS.orderNew({ order: 1, recipe: 'marinara' }))).toEqual(['orderNew']);
    expect(ids(ACTIONS.orderWarning({ order: 1 }))).toEqual(['warn']);
    expect(ids(ACTIONS.orderExpired({ order: 1 }))).toEqual(['expired']);
    expect(ids(ACTIONS.delivered({ player: 1, points: 20, tip: 0 }))).toEqual(['deliver', 'duck']);
  });
  it('countdown: 3-2-1 beep, 0 is "go", the last 10 s tick', () => {
    expect(ids(ACTIONS.countdownTick({ n: 3, kind: 'start' }))).toEqual(['count']);
    expect(ids(ACTIONS.countdownTick({ n: 1, kind: 'start' }))).toEqual(['count']);
    expect(ids(ACTIONS.countdownTick({ n: 0, kind: 'start' }))).toEqual(['go']);
    expect(ids(ACTIONS.countdownTick({ n: 10, kind: 'end' }))).toEqual(['tickEnd']);
    expect(ids(ACTIONS.countdownTick({ n: 0, kind: 'end' }))).toEqual([]);
  });
  it('round end stops every loop and blows the whistle; round start is silent by itself', () => {
    expect(ids(ACTIONS.roundEnd({ score: 0, delivered: 0 }))).toEqual(['stopLoops', 'whistle']);
    expect(ACTIONS.roundStart({})).toEqual([]);
  });
});

describe('recipes', () => {
  it('every voice has a positive duration and a gain in (0, 1]', () => {
    for (const [id, s] of Object.entries(SFX)) for (const v of s.voices) {
      expect(v.dur, id).toBeGreaterThan(0);
      expect(v.gain, id).toBeGreaterThan(0);
      expect(v.gain, id).toBeLessThanOrEqual(1);
    }
  });
  it('durations follow the spec table', () => {
    expect(sfxDuration('pickup')).toBeCloseTo(0.04);
    expect(sfxDuration('deliver')).toBeCloseTo(1.2);
    expect(sfxDuration('whistle')).toBeCloseTo(0.7);
    expect(sfxDuration('ready')).toBeCloseTo(0.8);
  });
  it('loop cadence: chop 250 ms, oven ~8 clicks/s', () => {
    expect(LOOPS.chop.every(0.5)).toBe(0.25);
    expect(1 / LOOPS.oven.every(0.5)).toBeGreaterThan(7);
    expect(1 / LOOPS.oven.every(0.5)).toBeLessThan(10);
  });
});
