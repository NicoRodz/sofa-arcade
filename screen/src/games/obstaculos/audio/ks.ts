// Karplus-Strong pluck: a noise burst circulating through a delay line with an averaging lowpass.
// `feedback` is the gain applied once per period (plan: 0.985). Deterministic for a given seed.
export function karplusStrong(freq: number, feedback: number, seconds: number, sampleRate: number, seed = 1): Float32Array {
  const n = Math.max(1, Math.floor(seconds * sampleRate));
  const period = Math.max(2, Math.round(sampleRate / Math.max(20, freq)));
  const out = new Float32Array(n);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < Math.min(period, n); i++) {
    // xorshift32 burst in -1..1
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    out[i] = (s / 0xffffffff) * 2 - 1;
  }
  for (let i = period; i < n; i++) out[i] = feedback * 0.5 * (out[i - period]! + out[i - period + 1 > i ? i - period : i - period + 1]!);
  return out;
}
