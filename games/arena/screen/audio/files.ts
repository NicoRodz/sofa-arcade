// The 13 files of the F8m suite (assets/, see assets/README.md). The URLs are built on demand: each `new URL(literal, import.meta.url)` is what lets the bundler find and
// copy the file, and nothing is read or requested until the audio layer asks for one.
export const AUDIO_FILES = [
  'lobby',
  'round-base',
  'round-30s',
  'round-final10',
  'stinger-tiempo-extra',
  'win',
  'lose',
  'pinata-fuse',
  'pinata-pop',
  'stained',
  'pickup',
  'sabotage-use',
  'event-alert',
] as const;
export type AudioFile = (typeof AUDIO_FILES)[number];

const URLS: Record<AudioFile, () => string> = {
  lobby: () => new URL('./assets/lobby.ogg', import.meta.url).href,
  'round-base': () => new URL('./assets/round-base.ogg', import.meta.url).href,
  'round-30s': () => new URL('./assets/round-30s.ogg', import.meta.url).href,
  'round-final10': () => new URL('./assets/round-final10.ogg', import.meta.url).href,
  'stinger-tiempo-extra': () => new URL('./assets/stinger-tiempo-extra.ogg', import.meta.url).href,
  win: () => new URL('./assets/win.ogg', import.meta.url).href,
  lose: () => new URL('./assets/lose.ogg', import.meta.url).href,
  'pinata-fuse': () => new URL('./assets/pinata-fuse.ogg', import.meta.url).href,
  'pinata-pop': () => new URL('./assets/pinata-pop.ogg', import.meta.url).href,
  stained: () => new URL('./assets/stained.ogg', import.meta.url).href,
  pickup: () => new URL('./assets/pickup.ogg', import.meta.url).href,
  'sabotage-use': () => new URL('./assets/sabotage-use.ogg', import.meta.url).href,
  'event-alert': () => new URL('./assets/event-alert.ogg', import.meta.url).href,
};

export const urlOf = (f: AudioFile): string => URLS[f]();
