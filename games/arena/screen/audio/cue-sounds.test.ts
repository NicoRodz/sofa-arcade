import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOOT_CUES, PHASE_CUES, RESCUE_CUE, SABOTAGE_CUES, SHOT_CUES, SWING_CUE, WRAP_CUES } from '../match/hud/cues';
import { SILENT_CUES, allCues, soundOfCue } from './cue-sounds';
import { AUDIO_FILES, urlOf } from './files';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'assets');

describe('cue -> file mapping', () => {
  it('lists every cue the HUD can emit (10 sabotages, the swing, 3 phase cues, the rescue, 3 loot cues, 6 shot cues, 3 wrap cues)', () => {
    expect(allCues()).toHaveLength(
      Object.keys(SABOTAGE_CUES).length +
        1 +
        Object.keys(PHASE_CUES).length +
        1 +
        Object.keys(LOOT_CUES).length +
        Object.keys(SHOT_CUES).length +
        Object.keys(WRAP_CUES).length,
    );
    expect(allCues()).toContain(SWING_CUE);
  });
  it.each(allCues().filter((c) => !SILENT_CUES.includes(c)))('cue %s has a sound whose file exists and is not empty', (cue) => {
    const s = soundOfCue(cue);
    expect(s, `no sound for ${cue}`).not.toBeNull();
    const path = join(dir, `${s!.file}.ogg`);
    expect(existsSync(path), path).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(1000);
    expect(s!.gain).toBeGreaterThan(0);
  });
  it('maps by family: sabotages -> sabotage-use, phases -> event-alert, swing -> pickup', () => {
    for (const c of Object.values(SABOTAGE_CUES)) expect(soundOfCue(c)?.file).toBe('sabotage-use');
    for (const c of Object.values(PHASE_CUES)) expect(soundOfCue(c)?.file).toBe('event-alert');
    expect(soundOfCue(SWING_CUE)?.file).toBe('pickup');
  });
  it('the PR3 cues: rescue -> pickup, loot drop -> event-alert, take -> pickup, expire is silent', () => {
    expect(soundOfCue(RESCUE_CUE)?.file).toBe('pickup');
    expect(soundOfCue(LOOT_CUES.drop)?.file).toBe('event-alert');
    expect(soundOfCue(LOOT_CUES.take)?.file).toBe('pickup');
    expect(soundOfCue(LOOT_CUES.expire)).toBeNull();
    expect(SILENT_CUES).toContain(LOOT_CUES.expire);
  });
  it('the PR4 cues: hit and pass -> sabotage-use (pass quieter), clash -> event-alert at 50 %, launch, miss and cancel are silent', () => {
    expect(soundOfCue(SHOT_CUES.hit)).toEqual({ file: 'sabotage-use', gain: 1 });
    expect(soundOfCue(SHOT_CUES.pass)).toEqual({ file: 'sabotage-use', gain: 0.8 });
    expect(soundOfCue(SHOT_CUES.clash)).toEqual({ file: 'event-alert', gain: 0.5 });
    for (const c of [SHOT_CUES.launch, SHOT_CUES.miss, SHOT_CUES.cancel]) {
      expect(soundOfCue(c)).toBeNull();
      expect(SILENT_CUES).toContain(c);
    }
  });
  it('every shot cue is either silent on purpose or has a sound', () => {
    for (const c of Object.values(SHOT_CUES)) expect(SILENT_CUES.includes(c) !== (soundOfCue(c) !== null)).toBe(true);
  });
  it('the three PR6 cues (tape lands, sponge squeezed, sponge bursts) each have a sound; none is silent', () => {
    expect(soundOfCue(WRAP_CUES.tape)).toEqual({ file: 'sabotage-use', gain: 0.6 });
    expect(soundOfCue(WRAP_CUES.squeeze)).toEqual({ file: 'pinata-pop', gain: 0.7 });
    expect(soundOfCue(WRAP_CUES.burst)).toEqual({ file: 'pinata-pop', gain: 1 });
    for (const c of Object.values(WRAP_CUES)) expect(SILENT_CUES).not.toContain(c);
  });
  it('an unknown cue has no sound', () => expect(soundOfCue('nope')).toBeNull());
});

describe('the suite on disk', () => {
  it.each([...AUDIO_FILES])('%s.ogg exists and its URL points to assets/', (f) => {
    expect(existsSync(join(dir, `${f}.ogg`))).toBe(true);
    expect(urlOf(f)).toMatch(new RegExp(`assets/${f}\\.ogg`));
  });
  it('is 13 files', () => expect(AUDIO_FILES).toHaveLength(13));
});
