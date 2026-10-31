// Glue: subscribes to the game bus, owns the AudioContext, unlocks it on a user gesture, runs the scheduler.
import type { GameEvents, Emitter } from '../../sim/round/events';
import { DUCK_GAIN, DUCK_S, BUS_GAIN, LoopTable, SfxLimiter, hintText, masterGain, rateFor } from '@pichi/screen-kit/audio/mixer';
import {
  LOOKAHEAD_S,
  TICK_MS,
  advance,
  modeFor,
  newSched,
  pickTheme,
  themeFor,
  type Mode,
  type Snapshot,
} from '@pichi/screen-kit/audio/music';
import type { Action, SfxId } from '@pichi/screen-kit/audio/recipes';
import { ACTIONS } from './actions';
import { PANT_AT_MS, SURFACE_ACTIONS } from './surfaces';
import { MUTATE_ACTIONS } from './mutate';
import { MECH_ACTIONS } from './mech';
import { createChain, playNote, playSfx } from '@pichi/screen-kit/audio/synth';

export interface AudioController {
  playerJoined(): void;
  toggleMute(): void;
  ui(id: SfxId): void;
}
const NOOP: AudioController = { playerJoined() {}, toggleMute() {}, ui() {} };
const MUTE_KEY = 'pg.muted';

// `rand` picks the match theme; it is deliberately not the simulation's RNG.
export function initAudio(bus: Emitter<GameEvents>, snapshot: () => Snapshot, rand: () => number = Math.random): AudioController {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return NOOP;
  const ctx = new Ctor();
  const chain = createChain(ctx);
  const limiter = new SfxLimiter();
  const loops = new LoopTable();
  let sched = newSched(0);
  let theme = pickTheme(null, rand);
  let prevMode: Mode = 'silent';
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    /* storage blocked: start unmuted */
  }
  chain.master.gain.value = masterGain(muted);

  const hint = document.createElement('div');
  hint.style.cssText =
    'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:5;padding:6px 14px;border-radius:8px;background:#000a;color:#ccc;font:13px system-ui,sans-serif;pointer-events:none';
  document.body.appendChild(hint);
  const refreshHint = () => {
    const text = hintText({ running: ctx.state === 'running', muted });
    hint.textContent = text;
    hint.style.display = text ? '' : 'none';
  };
  refreshHint();

  let confirmed = false;
  ctx.addEventListener('statechange', () => {
    if (ctx.state === 'running' && !confirmed) {
      confirmed = true;
      playSfx(ctx, chain, 'join', ctx.currentTime + 0.02);
    }
    refreshHint();
  });
  const unlock = () => {
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  };
  const toggleMute = () => {
    muted = !muted;
    chain.master.gain.setTargetAtTime(masterGain(muted), ctx.currentTime, 0.02);
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
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
      if (a.kind === 'play') {
        if (limiter.allow(a.id, now)) playSfx(ctx, chain, a.id, now, rateFor(a.id, Math.random()) * 2 ** ((a.semis ?? 0) / 12));
      } else if (a.kind === 'duck') duck(now);
      else loops.apply(a, now);
    }
  };
  for (const type of Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]) {
    bus.on(type, (p) => run((ACTIONS[type] as (p: unknown) => Action[])(p)));
  }
  for (const type of Object.keys(SURFACE_ACTIONS) as (keyof typeof SURFACE_ACTIONS)[]) bus.on(type, (p) => run(SURFACE_ACTIONS[type](p)));
  for (const type of Object.keys(MUTATE_ACTIONS) as (keyof typeof MUTATE_ACTIONS)[])
    bus.on(type, (p) => run((MUTATE_ACTIONS[type] as (p: unknown) => Action[])(p)));
  for (const type of Object.keys(MECH_ACTIONS) as (keyof typeof MECH_ACTIONS)[])
    bus.on(type, (p) => run((MECH_ACTIONS[type] as (p: unknown) => Action[])(p)));

  bus.on('rat:dodge', () => {
    for (const ms of PANT_AT_MS) setTimeout(() => run([{ kind: 'play', id: 'hiss', semis: -3 }]), ms);
  });

  setInterval(() => {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const mode = modeFor(snapshot());
    theme = themeFor(theme, prevMode, mode, rand);
    prevMode = mode;
    if (mode !== 'game' && mode !== 'rush') loops.clear();
    const look = document.hidden ? 1.5 : LOOKAHEAD_S; // hidden tabs throttle timers to ~1 s
    const r = advance(sched, now, look, mode, theme);
    sched = r.state;
    for (const n of r.notes) playNote(ctx, chain, n);
    for (const h of loops.due(now, look, Math.random)) playSfx(ctx, chain, h.sfx, h.at, rateFor(h.sfx, Math.random()));
  }, TICK_MS);

  return { playerJoined: () => run([{ kind: 'play', id: 'join' }]), toggleMute, ui: (id) => run([{ kind: 'play', id }]) };
}
