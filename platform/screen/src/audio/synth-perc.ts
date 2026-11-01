// Web Audio voices for the hybrid themes: tribal percussion (pitch-dropping sines plus noise) and the marimba/flute leads.
import type { Chain } from './chain-type';
import type { Scheduled } from './music';

function env(ctx: BaseAudioContext, out: AudioNode, t: number, dur: number, peak: number, att = 0.003): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + att);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  g.connect(out);
  return g;
}

// A sine that falls from f0 towards f1 with time constant tau (kicks, toms, congas).
function drop(ctx: BaseAudioContext, out: AudioNode, t: number, f0: number, f1: number, tau: number, dur: number, peak: number, harm = 0) {
  const e = env(ctx, out, t, dur, peak);
  for (const [mult, g] of harm
    ? [
        [1, 1],
        [2.1, harm],
      ]
    : [[1, 1]]) {
    const o = ctx.createOscillator();
    const v = ctx.createGain();
    v.gain.value = g!;
    o.frequency.setValueAtTime(f0 * mult!, t);
    o.frequency.setTargetAtTime(f1 * mult!, t, tau);
    o.connect(v).connect(e);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

function burst(
  ctx: BaseAudioContext,
  chain: Chain,
  out: AudioNode,
  t: number,
  type: BiquadFilterType,
  f: number,
  dur: number,
  peak: number,
) {
  const s = ctx.createBufferSource();
  s.buffer = chain.noise;
  s.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = f;
  flt.connect(env(ctx, out, t, dur, peak, 0.002));
  s.connect(flt);
  s.start(t, Math.random() * 0.9);
  s.stop(t + dur + 0.02);
}

function partial(ctx: BaseAudioContext, out: AudioNode, t: number, f: number, dur: number, peak: number, att: number, vib = 0) {
  const o = ctx.createOscillator();
  o.frequency.value = f;
  if (vib) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.value = f * vib;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }
  o.connect(env(ctx, out, t, dur, peak, att));
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Plays the voices synth.ts does not own; returns false for any other voice. */
export function playHybrid(ctx: BaseAudioContext, chain: Chain, { at: t, eighth, note: n }: Scheduled): boolean {
  const out = chain.music;
  const p = n.gain;
  const f = n.freqs[0] ?? 440;
  switch (n.voice) {
    case 'kick':
      drop(ctx, out, t, 82, 63, 0.03, 0.22, p);
      burst(ctx, chain, out, t, 'lowpass', 900, 0.02, p * 0.3);
      return true;
    case 'boom':
      drop(ctx, out, t, 60, 44, 0.06, 0.45, p);
      burst(ctx, chain, out, t, 'lowpass', 420, 0.055, p * 0.4);
      return true;
    case 'tomHi':
      drop(ctx, out, t, 640, 200, 0.045, 0.2, p, 0.4);
      return true;
    case 'tomMid':
      drop(ctx, out, t, 400, 160, 0.05, 0.22, p, 0.4);
      return true;
    case 'conga':
      drop(ctx, out, t, 450, 410, 0.08, 0.26, p, 0.5);
      burst(ctx, chain, out, t, 'bandpass', 1800, 0.03, p * 0.35);
      return true;
    case 'hat':
      burst(ctx, chain, out, t, 'highpass', 8500, 0.04, p);
      return true;
    case 'marimba':
      partial(ctx, out, t, f, 0.5, p, 0.003);
      partial(ctx, out, t, f * 3.9, 0.12, p * 0.45, 0.002);
      return true;
    case 'flute': {
      const dur = Math.max(0.12, n.len * eighth);
      partial(ctx, out, t, f, dur, p, 0.04, 0.004);
      partial(ctx, out, t, f * 2, dur, p * 0.15, 0.04);
      return true;
    }
    default:
      return false;
  }
}
