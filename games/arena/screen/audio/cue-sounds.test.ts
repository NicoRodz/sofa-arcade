import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PHASE_CUES, SABOTAGE_CUES, SWING_CUE } from '../match/hud/cues';
import { allCues, soundOfCue } from './cue-sounds';
import { AUDIO_FILES, urlOf } from './files';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'assets');

describe('cue -> file mapping', () => {
  it('lists every cue the HUD can emit (10 sabotages, the swing, 3 phase cues)', () => {
    expect(allCues()).toHaveLength(Object.keys(SABOTAGE_CUES).length + 1 + Object.keys(PHASE_CUES).length);
    expect(allCues()).toContain(SWING_CUE);
  });
  it.each(allCues())('cue %s has a sound whose file exists and is not empty', (cue) => {
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
  it('an unknown cue has no sound', () => expect(soundOfCue('nope')).toBeNull());
});

describe('the suite on disk', () => {
  it.each([...AUDIO_FILES])('%s.ogg exists and its URL points to assets/', (f) => {
    expect(existsSync(join(dir, `${f}.ogg`))).toBe(true);
    expect(urlOf(f)).toMatch(new RegExp(`assets/${f}\\.ogg`));
  });
  it('is 13 files', () => expect(AUDIO_FILES).toHaveLength(13));
});
