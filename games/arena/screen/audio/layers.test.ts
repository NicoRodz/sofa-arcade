import { describe, expect, it } from 'vitest';
import { FINAL_LEFT_TICKS, LAYER_FILES, MID_LEFT_TICKS, layerGains, layerOf, modeOf, type RoundClock } from './layers';

const D = 5400; // 90 s
const at = (left: number, ph: RoundClock['match']['ph']): RoundClock => ({ grid: { tick: D - left, durationTicks: D }, match: { ph } });
const ph = (phase: 'opening' | 'scramble' | 'final', hidden: boolean | null = null) => ({ phase, hidden });

describe('round layer by act', () => {
  it('Opening plays the base layer', () => expect(layerOf(at(D - 100, ph('opening')))).toBe('base'));
  it('Scramble plays the 30 s layer', () => expect(layerOf(at(3000, ph('scramble')))).toBe('mid'));
  it('the Final before the last 10 s stays on the 30 s layer', () => expect(layerOf(at(15 * 60, ph('final')))).toBe('mid'));
  it('the hidden scoreboard (decided blind or not) starts the final layer', () => {
    expect(layerOf(at(10 * 60, ph('final', true)))).toBe('final');
    expect(layerOf(at(10 * 60, ph('final', false)))).toBe('final');
  });
  it('time alone also does it: 10 s left -> final, even before hidden is latched', () =>
    expect(layerOf(at(FINAL_LEFT_TICKS, ph('final')))).toBe('final'));
  it('the Hourglass pushing the end away takes the layer back down', () => {
    expect(layerOf(at(FINAL_LEFT_TICKS, ph('final')))).toBe('final');
    expect(layerOf(at(FINAL_LEFT_TICKS + 15 * 60, ph('final')))).toBe('mid');
  });
  it('without acts it follows the clock: 30 s -> mid, 10 s -> final', () => {
    expect(layerOf(at(MID_LEFT_TICKS + 1, null))).toBe('base');
    expect(layerOf(at(MID_LEFT_TICKS, null))).toBe('mid');
    expect(layerOf(at(FINAL_LEFT_TICKS, null))).toBe('final');
  });
  it('gains are one-hot and the three layers have their own files', () => {
    expect(layerGains('mid')).toEqual({ base: 0, mid: 1, final: 0 });
    expect(Object.values(LAYER_FILES)).toEqual(['round-base', 'round-30s', 'round-final10']);
  });
});

describe('mode by phase', () => {
  const m = (phase: string, o: Partial<{ live: boolean; over: boolean; hasRound: boolean }> = {}) =>
    modeOf({ phase, live: true, over: false, hasRound: true, ...o });
  it('lobby, round, results', () => {
    expect(m('lobby')).toBe('lobby');
    expect(m('playing')).toBe('round');
    expect(m('results')).toBe('results');
  });
  it('silence in the menu, the 3-2-1 gate, the final board and a playing phase with no Manchazo round', () => {
    expect(m('menu')).toBe('off');
    expect(m('playing', { live: false })).toBe('off');
    expect(m('playing', { over: true })).toBe('off');
    expect(m('playing', { hasRound: false })).toBe('off');
  });
});
