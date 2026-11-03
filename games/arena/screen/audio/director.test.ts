import { describe, expect, it } from 'vitest';
import type { ManchazoState } from '../../sim';
import { createManchazo } from '../../sim';
import { createArenaAudio } from './audio';
import { createDirector } from './director';
import type { LoopKind, Sound } from './engine';
import type { AudioFile } from './files';
import type { Layer } from './layers';
import { setCueSink } from '../match/hud/cues';

function fake() {
  const log: string[] = [];
  const sound: Sound = {
    loop: (k: LoopKind | null) => void log.push(`loop:${k}`),
    layer: (l: Layer) => void log.push(`layer:${l}`),
    play: (f: AudioFile) => void log.push(`play:${f}`),
    toggleMute: () => void log.push('mute'),
  };
  return { log, sound };
}
const round = (): ManchazoState =>
  createManchazo({ slots: [0, 1], teams: [0, 1], seed: 7, mapSeed: 3, sabotage: true, events: true, phases: true, living: true });

describe('director', () => {
  it('lobby plays the lobby loop; the menu is silent', () => {
    const { log, sound } = fake();
    const d = createDirector(sound);
    d.sync({ state: null, phase: 'lobby', live: true });
    d.sync({ state: null, phase: 'menu', live: true });
    expect(log).toEqual(['loop:lobby', 'loop:null']);
  });
  it('a live round plays the layers, in Opening the base one; the countdown is silent', () => {
    const { log, sound } = fake();
    const d = createDirector(sound);
    const s = round();
    d.sync({ state: s, phase: 'playing', live: false });
    d.sync({ state: s, phase: 'playing', live: true });
    expect(log).toEqual(['loop:null', 'loop:round', 'layer:base']);
  });
  it('the layer follows the act: the last 10 s go to the final layer', () => {
    const { log, sound } = fake();
    const d = createDirector(sound);
    const s = round();
    s.grid.tick = s.grid.durationTicks - 300;
    d.sync({ state: s, phase: 'playing', live: true });
    expect(log).toContain('layer:final');
  });
  it('results play win once, also for a draw (nobody lost: no defeat jingle on a shared TV)', () => {
    const win = fake();
    const s = round();
    s.match.counts = [10, 3];
    const d = createDirector(win.sound);
    d.sync({ state: s, phase: 'results', live: true });
    d.sync({ state: s, phase: 'results', live: true });
    expect(win.log.filter((x) => x.startsWith('play:'))).toEqual(['play:win']);
    const draw = fake();
    const t = round();
    t.match.counts = [4, 4];
    t.match.reachedAt = [9, 9];
    createDirector(draw.sound).sync({ state: t, phase: 'results', live: true });
    expect(draw.log.filter((x) => x.startsWith('play:'))).toEqual(['play:win']);
  });
  it('a new round does not replay what the last one had', () => {
    const { log, sound } = fake();
    const d = createDirector(sound);
    d.sync({ state: round(), phase: 'playing', live: true });
    d.sync({ state: round(), phase: 'playing', live: true });
    expect(log.filter((x) => x.startsWith('play:'))).toEqual([]);
  });
  it('cues go to their file with their gain; unknown cues are dropped', () => {
    const { log, sound } = fake();
    const d = createDirector(sound);
    d.cue('sab-glue');
    d.cue('nope');
    expect(log).toEqual(['play:sabotage-use']);
  });
});

describe('createArenaAudio', () => {
  it('creates nothing on its own, nothing in the menu, and wires the cue sink on the first lobby frame', () => {
    let made = 0;
    const { log, sound } = fake();
    const a = createArenaAudio(() => (made++, sound));
    expect(made).toBe(0);
    a.sync({ state: null, phase: 'menu', live: true });
    expect(made).toBe(0);
    a.sync({ state: null, phase: 'lobby', live: true });
    a.sync({ state: null, phase: 'lobby', live: true });
    expect(made).toBe(1);
    a.toggleMute();
    expect(log).toContain('mute');
    setCueSink(null);
  });
  it('with no AudioContext (engine null) every call is a no-op', () => {
    const a = createArenaAudio(() => null);
    a.sync({ state: null, phase: 'lobby', live: true });
    expect(() => a.toggleMute()).not.toThrow();
  });
});
