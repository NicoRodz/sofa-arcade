// Web Audio rendering of the pure recipes and music notes. Works on a live or an offline context.
// The chain (buses -> master -> compressor -18 dB 4:1 -> soft-clip -> destination) is the one of screen/src/audio.
import { createChain, type Chain } from '@pichi/screen-kit/audio';
import { karplusStrong } from './ks';
import { noteVoices, type Scheduled } from './music';
import { voicesFor, type Cue, type Voice } from './recipes';

export { createChain, type Chain };

function envelope(ctx: BaseAudioContext, t: number, dur: number, peak: number, att: number, out: AudioNode): GainNode {
  const g = ctx.createGain();
  const a = Math.min(att, dur / 2);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  g.connect(out);
  return g;
}

function ramp(p: AudioParam, from: number, to: number | undefined, t: number, over: number) {
  p.setValueAtTime(from, t);
  if (to) p.exponentialRampToValueAtTime(to, t + over);
}

let seedCounter = 1;
export function playVoice(ctx: BaseAudioContext, chain: Chain, out: AudioNode, v: Voice, t0: number) {
  const t = t0 + v.at;
  const env = envelope(ctx, t, v.dur, v.gain, v.att ?? 0.005, out);
  let head: AudioNode = env;
  if (v.filter) {
    const f = ctx.createBiquadFilter();
    f.type = v.filter.type;
    ramp(f.frequency, v.filter.f0, v.filter.f1, t, v.dur);
    if (v.filter.q !== undefined) f.Q.value = v.filter.q;
    f.connect(env);
    head = f;
  }
  const end = t + v.dur + 0.02;
  if (v.src === 'noise') {
    const s = ctx.createBufferSource();
    s.buffer = chain.noise;
    s.loop = true;
    s.connect(head);
    s.start(t, Math.random() * 0.9);
    s.stop(end);
    return;
  }
  if (v.src === 'pluck') {
    const s = ctx.createBufferSource();
    const data = karplusStrong(v.f0 ?? 220, v.ks ?? 0.985, v.dur + 0.02, ctx.sampleRate, seedCounter++);
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    s.buffer = buf;
    s.connect(head);
    s.start(t);
    s.stop(end);
    return;
  }
  const o = ctx.createOscillator();
  o.type = v.src === 'fm' ? 'sine' : v.src;
  const f0 = v.f0 ?? 440;
  ramp(o.frequency, f0, v.f1, t, v.glide ?? v.dur);
  if (v.detune) o.detune.value = v.detune;
  if (v.vib) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = v.vib.rate;
    depth.gain.value = v.vib.depth;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(end);
  }
  if (v.src === 'fm' && v.fm) {
    const mod = ctx.createOscillator();
    const idx = ctx.createGain();
    mod.frequency.value = f0 * v.fm.ratio;
    ramp(idx.gain, Math.max(0.001, v.fm.i0) * f0 * v.fm.ratio, v.fm.i1 > 0 ? v.fm.i1 * f0 * v.fm.ratio : 0.001, t, v.fm.t);
    mod.connect(idx).connect(o.frequency);
    mod.start(t);
    mod.stop(end);
  }
  o.connect(head);
  o.start(t);
  o.stop(end);
}

export function playCue(ctx: BaseAudioContext, chain: Chain, c: Cue, t: number) {
  for (const v of voicesFor(c)) playVoice(ctx, chain, chain.sfx, v, t);
}
export function playMusicNote(ctx: BaseAudioContext, chain: Chain, { at, stepS, note }: Scheduled) {
  for (const v of noteVoices(note, stepS)) playVoice(ctx, chain, chain.music, v, at);
}
