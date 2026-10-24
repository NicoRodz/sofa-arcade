// Glue: subscribes to the game bus, owns the AudioContext, unlocks it on a user gesture, runs the scheduler.
import type { Emitter, GameEvents } from '@party/shared/events';
import { DUCK_GAIN, DUCK_S, BUS_GAIN, LoopTable, SfxLimiter, hintText, masterGain, rateFor } from './mixer';
import { LOOKAHEAD_S, TICK_MS, advance, modeFor, newSched, type Snapshot } from './music';
import { ACTIONS, type Action } from './recipes';
import { createChain, playNote, playSfx } from './synth';

export interface AudioController { playerJoined(): void; toggleMute(): void }
const NOOP: AudioController = { playerJoined() {}, toggleMute() {} };
const MUTE_KEY = 'pg.muted';

export function initAudio(bus: Emitter<GameEvents>, snapshot: () => Snapshot): AudioController {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return NOOP;
  const ctx = new Ctor();
  const chain = createChain(ctx);
  const limiter = new SfxLimiter();
  const loops = new LoopTable();
  let sched = newSched(0);
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked: start unmuted */ }
  chain.master.gain.value = masterGain(muted);

  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:5;padding:6px 14px;border-radius:8px;background:#000a;color:#ccc;font:13px system-ui,sans-serif;pointer-events:none';
  document.body.appendChild(hint);
  const refreshHint = () => {
    const text = hintText({ running: ctx.state === 'running', muted });
    hint.textContent = text;
    hint.style.display = text ? '' : 'none';
  };
  refreshHint();

  let confirmed = false;
  ctx.addEventListener('statechange', () => {
    if (ctx.state === 'running' && !confirmed) { confirmed = true; playSfx(ctx, chain, 'join', ctx.currentTime + 0.02); }
    refreshHint();
  });
  const unlock = () => { if (ctx.state !== 'running') void ctx.resume().catch(() => {}); };
  const toggleMute = () => {
    muted = !muted;
    chain.master.gain.setTargetAtTime(masterGain(muted), ctx.currentTime, 0.02);
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
    refreshHint();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', (e) => {
    unlock();
    if ((e.key === 'm' || e.key === 'M') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) toggleMute();
  });

  const duck = (t: number) => {
    const g = chain.music.gain;
    g.setTargetAtTime(BUS_GAIN.music * DUCK_GAIN, t, 0.03);
    g.setTargetAtTime(BUS_GAIN.music, t + DUCK_S, 0.1);
  };
  const run = (actions: Action[]) => {
    if (ctx.state !== 'running') return; // the game never depends on audio
    const now = ctx.currentTime;
    for (const a of actions) {
      if (a.kind === 'play') { if (limiter.allow(a.id, now)) playSfx(ctx, chain, a.id, now, rateFor(a.id, Math.random())); }
      else if (a.kind === 'duck') duck(now);
      else loops.apply(a, now);
    }
  };
  for (const type of Object.keys(ACTIONS) as (keyof GameEvents)[]) {
    bus.on(type, (p) => run((ACTIONS[type] as (p: unknown) => Action[])(p)));
  }

  setInterval(() => {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const mode = modeFor(snapshot());
    if (mode !== 'game' && mode !== 'rush') loops.clear();
    const look = document.hidden ? 1.5 : LOOKAHEAD_S; // hidden tabs throttle timers to ~1 s
    const r = advance(sched, now, look, mode);
    sched = r.state;
    for (const n of r.notes) playNote(ctx, chain, n);
    for (const h of loops.due(now, look, Math.random)) playSfx(ctx, chain, h.sfx, h.at, rateFor(h.sfx, Math.random()));
  }, TICK_MS);

  return { playerJoined: () => run([{ kind: 'play', id: 'join' }]), toggleMute };
}
