// Manchazo's sound as the screen uses it: created on the first frame in the lobby or a round (never when the module loads, never for another game), then driven by `sync`.
import { setCueSink } from '../match/hud/cues';
import { createDirector, type SyncInput } from './director';
import { createEngine, type Sound } from './engine';

export interface ArenaAudio {
  sync(i: SyncInput): void;
  toggleMute(): void;
}

export function createArenaAudio(make: () => Sound | null = createEngine): ArenaAudio {
  let sound: Sound | null | undefined;
  let director: ReturnType<typeof createDirector> | undefined;
  return {
    sync(i) {
      if (sound === undefined) {
        if (i.phase !== 'lobby' && i.phase !== 'playing' && i.phase !== 'results') return; // the menu does not wake the audio
        sound = make();
        if (sound) {
          director = createDirector(sound);
          setCueSink((cue) => director?.cue(cue)); // the HUD's cues (hud/cues.ts) reach the director from now on
        }
      }
      director?.sync(i);
    },
    toggleMute: () => sound?.toggleMute(),
  };
}
