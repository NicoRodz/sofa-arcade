// Web Audio rendering of the pure recipes. Works on a live or an offline context.
import { BUS_GAIN, COMPRESSOR, MASTER_GAIN, softClip } from './mixer';
import type { Note, Scheduled } from './music';
import { SFX, type SfxId, type Voice } from './recipes';

export interface Chain {
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  ui: GainNode;
  noise: AudioBuffer;
}

// buses -> master -> compressor -> destination
export function createChain(ctx: BaseAudioContext): Chain {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = COMPRESSOR.threshold;
  comp.ratio.value = COMPRESSOR.ratio;
  comp.attack.value = COMPRESSOR.attack;
  comp.release.value = COMPRESSOR.release;
  const safety = ctx.createWaveShaper();
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) curve[i] = softClip(((i / (curve.length - 1)) * 2 - 1) * 4); // input range -4..4
  safety.curve = curve;
  const pre = ctx.createGain(); // the shaper only sees -1..1, so scale the +-4 range into it
  pre.gain.value = 0.25;
  comp.connect(pre).connect(safety).connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(comp);
  const bus = (g: number) => { const n = ctx.createGain(); n.gain.value = g; n.connect(master); return n; };
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return { master, music: bus(BUS_GAIN.music), sfx: bus(BUS_GAIN.sfx), ui: bus(BUS_GAIN.ui), noise };
}

// Attack, then exponential decay to 0.001 (never to 0); `att` > dur/2 gives a swell.
function envelope(ctx: BaseAudioContext, t: number, dur: number, peak: number, att: number, out: AudioNode, hold = 0): GainNode {
  const g = ctx.createGain();
  const a = Math.min(att, dur / 2);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (hold > a) g.gain.setValueAtTime(peak, t + hold);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  g.connect(out);
  return g;
}

function noiseSource(ctx: BaseAudioContext, chain: Chain, t: number, dur: number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = chain.noise;
  s.loop = true;
  s.start(t, Math.random() * 0.9);
  s.stop(t + dur + 0.02);
  return s;
}

function filterNode(ctx: BaseAudioContext, f: NonNullable<Voice['filter']>, t: number, dur: number): BiquadFilterNode {
  const n = ctx.createBiquadFilter();
  n.type = f.type;
  n.frequency.setValueAtTime(f.f0, t);
  if (f.f1) n.frequency.exponentialRampToValueAtTime(f.f1, t + dur);
  if (f.q !== undefined) n.Q.value = f.q;
  return n;
}

function playVoice(ctx: BaseAudioContext, chain: Chain, out: AudioNode, v: Voice, t0: number, rate: number) {
  const t = t0 + v.at;
  const env = envelope(ctx, t, v.dur, v.gain, v.att ?? 0.005, out);
  let head: AudioNode = env;
  if (v.filter) { const f = filterNode(ctx, v.filter, t, v.dur); f.connect(env); head = f; }
  if (v.src === 'noise') { noiseSource(ctx, chain, t, v.dur).connect(head); return; }
  const o = ctx.createOscillator();
  o.type = v.src;
  o.frequency.setValueAtTime((v.f0 ?? 440) * rate, t);
  if (v.f1) o.frequency.exponentialRampToValueAtTime(v.f1 * rate, t + v.dur);
  if (v.vib) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = v.vib.rate;
    depth.gain.value = v.vib.depth;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t); lfo.stop(t + v.dur + 0.02);
  }
  o.connect(head);
  o.start(t); o.stop(t + v.dur + 0.02);
}

export function playSfx(ctx: BaseAudioContext, chain: Chain, id: SfxId, t: number, rate = 1) {
  const s = SFX[id];
  for (const v of s.voices) playVoice(ctx, chain, chain[s.bus], v, t, rate);
}

// Music voices. `n.len` is in eighths; `eighth` is the current eighth duration in seconds.
export function playNote(ctx: BaseAudioContext, chain: Chain, { at, eighth, note: n }: Scheduled) {
  const dur = Math.max(0.03, n.len * eighth);
  const out = chain.music;
  const peak = n.gain;
  switch (n.voice) {
    case 'bass': tone(ctx, out, 'triangle', n.freqs, at, Math.min(dur, 0.18), peak); break;
    case 'mandolin': {
      tone(ctx, out, 'triangle', n.freqs, at, 0.09, peak);
      tone(ctx, out, 'square', n.freqs, at, 0.09, peak * 0.3);
      break;
    }
    case 'accordion': accordion(ctx, out, n, at, dur * 0.85); break;
    case 'tambourine': {
      const s = ctx.createBufferSource();
      s.buffer = chain.noise; s.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 7000;
      hp.connect(envelope(ctx, at, 0.05, peak, 0.002, out));
      s.connect(hp);
      s.start(at, Math.random() * 0.9); s.stop(at + 0.07);
      break;
    }
  }
}

function tone(ctx: BaseAudioContext, out: AudioNode, type: OscillatorType, freqs: number[], t: number, dur: number, peak: number, detune = 0) {
  const env = envelope(ctx, t, dur, peak / Math.max(1, freqs.length), 0.005, out);
  for (const f of freqs) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(env);
    o.start(t); o.stop(t + dur + 0.02);
  }
}

// Two detuned saws through a lowpass, with a 6 Hz tremolo at 15%; sustained, then released.
function accordion(ctx: BaseAudioContext, out: AudioNode, n: Note, t: number, dur: number) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2200;
  const trem = ctx.createGain();
  trem.gain.value = 0.85;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 6; lfoGain.gain.value = 0.15;
  lfo.connect(lfoGain).connect(trem.gain);
  lfo.start(t); lfo.stop(t + dur + 0.05);
  const mix = ctx.createGain();
  mix.gain.value = 1 / (n.freqs.length * 2);
  mix.connect(lp);
  lp.connect(trem);
  trem.connect(envelope(ctx, t, dur, n.gain, 0.015, out, dur * 0.6));
  for (const f of n.freqs) for (const d of [-7, 7]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
    o.connect(mix);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
