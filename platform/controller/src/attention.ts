// Attention cue: when something appears or changes on the phone, the player is looking at the big screen. So the phone pulses in the
// player's colour, plays a short tone and vibrates where it can (iOS Safari cannot: there the colour and the tone carry it).
import './attention.css';
import type { ServerMsg } from '@pichi/core';

export type Cue = 'turn' | 'go' | 'done' | 'soft' | 'alert';
export interface CueMemory {
  phase: string | null;
  captain: number | null;
}

// Pure: which cue (if any) a message from the relay deserves. `mem` is updated as a side effect.
export function cueFor(m: ServerMsg, me: number | null, mem: CueMemory): Cue | null {
  if (m.t === 'phase') {
    const was = mem.phase;
    mem.phase = m.phase;
    if (was === m.phase) return null;
    if (m.phase === 'playing' || m.phase === 'school') return was === 'playing' || was === 'school' ? null : 'go';
    return m.phase === 'results' ? 'done' : null;
  }
  if (m.t === 'captain') {
    const was = mem.captain;
    mem.captain = m.playerId;
    return m.playerId === me && was !== me ? 'turn' : null; // the menus are yours now
  }
  if (m.t === 'buzz') return m.kind === 'alert' ? 'alert' : null; // something is coming in the kitchen: look at the screen
  if (m.t === 'assist') return m.playerId === me && m.on ? 'soft' : null;
  return null;
}

const TONES: Record<Cue, [freq: number, ms: number][]> = {
  turn: [
    [660, 110],
    [880, 110],
    [1320, 200],
  ],
  go: [
    [520, 90],
    [780, 160],
  ],
  done: [
    [784, 110],
    [587, 220],
  ],
  soft: [[740, 120]],
  alert: [
    [988, 90],
    [740, 90],
    [988, 90],
  ],
};
const VIBRATION: Record<Cue, number[]> = {
  turn: [60, 40, 60, 40, 120],
  go: [50, 30, 90],
  done: [90, 50, 160],
  soft: [40],
  alert: [80, 50, 80, 50, 160],
};

let ctx: AudioContext | undefined;
let el: HTMLElement | undefined;
const unlock = () => {
  try {
    ctx ??= new AudioContext();
    void ctx.resume(); // browsers only allow sound after a touch: the first one on the pad unlocks it
  } catch {
    /* no audio: the colour still shows */
  }
};
if (typeof document !== 'undefined') addEventListener('pointerdown', unlock, { passive: true }); // not in a node test

function play(cue: Cue) {
  if (!ctx || ctx.state !== 'running') return;
  let t = ctx.currentTime;
  for (const [f, ms] of TONES[cue]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
    t += ms / 1000 + 0.03;
  }
}

export function fireCue(cue: Cue) {
  if (!el) {
    el = document.createElement('div');
    el.id = 'cue';
    document.body.appendChild(el);
  }
  el.classList.remove('on', 'long');
  void el.offsetWidth; // restart the animation
  el.classList.add('on');
  el.classList.toggle('long', cue === 'turn');
  play(cue);
  try {
    navigator.vibrate?.(VIBRATION[cue]);
  } catch {
    /* blocked */
  }
}

const mem: CueMemory = { phase: null, captain: null };
export function attend(m: ServerMsg, me: number | null) {
  const c = cueFor(m, me, mem);
  if (c) fireCue(c);
}
