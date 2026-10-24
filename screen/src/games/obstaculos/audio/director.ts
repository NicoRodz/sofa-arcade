// Glue: subscribes to the obst.* events on the session bus, owns the AudioContext, runs the music scheduler.
// The game never depends on audio: every path is a no-op until the context runs.
import { BUS_GAIN, DUCK_GAIN, DUCK_S, masterGain } from '../../../audio/mixer';
import type { Biome, ObstEvents } from '@party/shared/obstaculos';
import { VoiceLimiter } from './mixer';
import { LOOKAHEAD_S, TICK_MS, advance, newSched, type MusicState } from './music';
import { HANDLERS, cuesFor } from './recipes';
import { createChain, playCue, playMusicNote } from './synth';

/** What the scene's bus offers: Emitter<GameEvents & ObstEvents> satisfies it. */
export interface ObstBus { on<K extends keyof ObstEvents>(type: K, fn: (p: ObstEvents[K]) => void): () => void }
export interface ObstAudio { toggleMute(): void; dispose(): void }
const NOOP: ObstAudio = { toggleMute() {}, dispose() {} };
const NAMES = Object.keys(HANDLERS) as (keyof ObstEvents)[];

/** `bus` is the session emitter (typed Emitter<GameEvents & ObstEvents> by the scene); `state` is read every tick. */
export function initObstAudio(bus: ObstBus, biome: () => Biome, state: () => MusicState): ObstAudio {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return NOOP;
  const ctx = new Ctor();
  const chain = createChain(ctx);
  const limiter = new VoiceLimiter();
  let sched = newSched(0);
  let muted = false;
  chain.master.gain.value = masterGain(muted);
  const unlock = () => { if (ctx.state !== 'running') void ctx.resume().catch(() => {}); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  const duck = (t: number) => {
    const g = chain.music.gain;
    g.setTargetAtTime(BUS_GAIN.music * DUCK_GAIN, t, 0.03);
    g.setTargetAtTime(BUS_GAIN.music, t + DUCK_S, 0.1);
  };
  const listen = <K extends keyof ObstEvents>(name: K) => bus.on(name, (p) => {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const c of cuesFor(name, p, biome())) {
      if (!limiter.allow(c, now)) continue;
      playCue(ctx, chain, c, now);
      if (c.duck) duck(now);
    }
  });
  const offs = NAMES.map((n) => listen(n));
  const timer = setInterval(() => {
    if (ctx.state !== 'running') return;
    const look = document.hidden ? 1.5 : LOOKAHEAD_S;
    const r = advance(sched, ctx.currentTime, look, state());
    sched = r.state;
    for (const n of r.notes) playMusicNote(ctx, chain, n);
  }, TICK_MS);
  return {
    toggleMute() { muted = !muted; chain.master.gain.setTargetAtTime(masterGain(muted), ctx.currentTime, 0.02); },
    dispose() {
      clearInterval(timer);
      for (const off of offs) off();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      void ctx.close().catch(() => {});
    },
  };
}
