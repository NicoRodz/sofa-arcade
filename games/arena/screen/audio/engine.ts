// Web Audio side of Manchazo's sound: one AudioContext, the decoded files, the lobby loop, the three round layers started together, one-shots. It REUSES the platform's mixing
// (createChain: buses -> master -> compressor -> soft clip; masterGain; DUCK_GAIN). It registers its context with the platform's audio gate (the first gesture on the TV, even in the menu, unlocks it)
// and shows the platform's sound hint while the context is blocked or Manchazo is muted. Nothing here decides WHAT plays: director.ts does.
// The game never depends on audio: a file that fails to load, a suspended context or a missing AudioContext only means silence.
import { DUCK_GAIN, DUCK_S, audioGate, createChain, createSoundHint, masterGain } from '@pichi/screen-kit/audio';
import { AUDIO_FILES, urlOf, type AudioFile } from './files';
import { LAYERS, LAYER_FILES, layerGains, type Layer } from './layers';

export type LoopKind = 'lobby' | 'round';
/** What director.ts needs from the sound: tested with a fake. */
export interface Sound {
  loop(kind: LoopKind | null): void;
  layer(l: Layer): void;
  play(file: AudioFile, gain?: number): void;
  toggleMute(): void;
}

export const MUTE_KEY = 'pg.muted.arena'; // Manchazo's own flag: Pizzas' and Obstáculos' 'pg.muted' must not silence Manchazo without a sign (the hint shows "Sonido silenciado (M)" when it is muted)
export const MUSIC_TRIM = 1.5; // the files are mastered at about -15 LUFS and the music bus sits at 0.35: this brings the music up next to the one-shots (-12 LUFS)
export const FADE_TAU = 0.15; // s: fading a loop out
export const XFADE_TAU = 0.35; // s: crossfading between layers (95 % in about 1 s)
export const MIN_GAP_S = 0.05; // the same one-shot twice inside this is dropped
const START_LEAD_S = 0.05;

export function createEngine(): Sound | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const chain = createChain(ctx);
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    /* storage blocked: start unmuted */
  }
  chain.master.gain.value = masterGain(muted);
  const hint = createSoundHint(
    () => ctx.state === 'running',
    () => muted,
  );
  ctx.addEventListener('statechange', hint.refresh);
  const bed = ctx.createGain(); // between the loops and the music bus: ducked under a stinger
  bed.connect(chain.music);

  const buffers = new Map<AudioFile, AudioBuffer>();
  const loading = new Set<AudioFile>();
  const load = (f: AudioFile) => {
    if (buffers.has(f) || loading.has(f)) return;
    loading.add(f);
    fetch(urlOf(f))
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((d) => void buffers.set(f, d))
      .catch(() => {}); // silence, not an error
  };
  for (const f of AUDIO_FILES) load(f);

  audioGate().register(ctx); // resumes on the first gesture, or at once if one already happened in the menu

  interface Running {
    kind: LoopKind;
    out: GainNode;
    layers: Partial<Record<Layer, GainNode>>;
    sources: AudioBufferSourceNode[];
  }
  let wanted: LoopKind | null = null;
  let current: Running | null = null;
  let layer: Layer = 'base';

  const fadeOut = (r: Running) => {
    const t = ctx.currentTime;
    r.out.gain.setTargetAtTime(0, t, FADE_TAU);
    for (const s of r.sources) s.stop(t + 1.5);
  };
  const source = (f: AudioFile, to: AudioNode, t0: number): AudioBufferSourceNode => {
    const s = ctx.createBufferSource();
    s.buffer = buffers.get(f)!;
    s.loop = true;
    s.connect(to);
    s.start(t0);
    return s;
  };
  const start = (kind: LoopKind): Running => {
    const out = ctx.createGain();
    out.gain.value = MUSIC_TRIM;
    out.connect(bed);
    const t0 = ctx.currentTime + START_LEAD_S; // the three layers begin on the same sample
    if (kind === 'lobby') return { kind, out, layers: {}, sources: [source('lobby', out, t0)] };
    const r: Running = { kind, out, layers: {}, sources: [] };
    const gains = layerGains(layer);
    for (const l of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = gains[l];
      g.connect(out);
      r.layers[l] = g;
      r.sources.push(source(LAYER_FILES[l], g, t0));
    }
    return r;
  };
  const files = (k: LoopKind): AudioFile[] => (k === 'lobby' ? ['lobby'] : LAYERS.map((l) => LAYER_FILES[l]));
  const reconcile = () => {
    if (current && current.kind !== wanted) {
      fadeOut(current);
      current = null;
    }
    if (current || !wanted || ctx.state !== 'running' || !files(wanted).every((f) => buffers.has(f))) return; // it starts on a later frame once decoded and unlocked
    current = start(wanted);
  };

  const lastAt = new Map<AudioFile, number>();
  return {
    loop(kind) {
      wanted = kind;
      reconcile();
    },
    layer(l) {
      layer = l;
      if (current?.kind !== 'round') return;
      const gains = layerGains(l);
      for (const k of LAYERS) current.layers[k]?.gain.setTargetAtTime(gains[k], ctx.currentTime, XFADE_TAU);
    },
    play(file, gain = 1) {
      const b = buffers.get(file);
      const t = ctx.currentTime;
      if (!b || ctx.state !== 'running' || t - (lastAt.get(file) ?? -1) < MIN_GAP_S) return;
      lastAt.set(file, t);
      const g = ctx.createGain();
      g.gain.value = gain;
      g.connect(chain.sfx);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(g);
      s.start(t);
      if (file === 'stinger-tiempo-extra') {
        bed.gain.setTargetAtTime(DUCK_GAIN, t, 0.03); // the music steps back for the stinger
        bed.gain.setTargetAtTime(1, t + b.duration + DUCK_S, 0.1);
      }
    },
    toggleMute() {
      muted = !muted;
      chain.master.gain.setTargetAtTime(masterGain(muted), ctx.currentTime, 0.02);
      try {
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        /* ignore */
      }
      hint.refresh();
    },
  };
}
