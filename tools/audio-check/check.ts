// Runs in headless Chrome: renders every sound offline and reports peak / RMS / duration.
import { createChain, playNote, playSfx } from '../../screen/src/audio/synth';
import { advance, newSched, type Mode } from '../../screen/src/audio/music';
import { SFX, sfxDuration, type SfxId } from '../../screen/src/audio/recipes';

const SR = 44100;
const START = 0.1;
interface Row { name: string; expected: number; peak: number; rms: number; onset: number; effDur: number; nan: boolean }

async function render(len: number, build: (ctx: OfflineAudioContext, chain: ReturnType<typeof createChain>) => void): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * len), SR);
  build(ctx, createChain(ctx));
  return (await ctx.startRendering()).getChannelData(0);
}
function measure(name: string, d: Float32Array, expected: number, from = 0): Row {
  let peak = 0, sum = 0, first = -1, last = -1, nan = false;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]!);
    if (Number.isNaN(a)) { nan = true; continue; }
    peak = Math.max(peak, a); sum += a * a;
    if (a > 1e-4 && first < 0) first = i;
    if (a > 1e-3) last = i;
  }
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { name, expected, peak: r(peak), rms: r(Math.sqrt(sum / d.length)), onset: first < 0 ? -1 : r(first / SR - from), effDur: last < 0 ? 0 : r((last - Math.max(first, 0)) / SR), nan };
}

async function main() {
  const rows: Row[] = [];
  for (const id of Object.keys(SFX) as SfxId[]) {
    const d = await render(sfxDuration(id) + 0.6, (ctx, chain) => playSfx(ctx, chain, id, START));
    rows.push(measure(`sfx:${id}`, d, sfxDuration(id), START));
  }
  for (const mode of ['lobby', 'game', 'rush', 'results'] as Mode[]) {
    const len = mode === 'results' ? 7 : 6;
    const d = await render(len, (ctx, chain) => { for (const n of advance(newSched(0), 0, len - 0.6, mode).notes) playNote(ctx, chain, n); });
    rows.push(measure(`music:${mode}`, d, len - 0.6));
  }
  // worst case: last-minute music + delivery + 3 chops + 3 ovens crackling + warning + whistle, all at once
  const stress = await render(4, (ctx, chain) => {
    for (const n of advance(newSched(0), 0, 3.5, 'rush').notes) playNote(ctx, chain, n);
    for (const id of ['deliver', 'deliver', 'deliver', 'warn', 'whistle', 'orderNew', 'expired', 'ready'] as SfxId[]) playSfx(ctx, chain, id, 1);
    for (let t = 0.5; t < 3.5; t += 0.25) for (let k = 0; k < 3; k++) playSfx(ctx, chain, 'cut', t);
    for (let t = 0.5; t < 3.5; t += 0.04) playSfx(ctx, chain, 'crackle', t);
  });
  rows.push(measure('stress:everything', stress, 3.5));
  document.getElementById("out")!.textContent = JSON.stringify(rows);
  document.title = 'done';
}
void main();
