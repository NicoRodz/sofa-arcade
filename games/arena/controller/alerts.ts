// F9: the loud notices of the phone. The player is looking at the TV, so each event that touches THEIR body takes the whole phone for a moment: a colour, big words, a tone
// (the vibration is the platform's: BUZZ_PATTERNS of the same kind). The screen only says which one (`buzz`); the words, colours and tones are the phone's own.
import type { BuzzKind } from '@pichi/core';

export type Tone = readonly [freq: number, ms: number, wave?: OscillatorType];
export interface AlertSpec {
  title: string;
  line: string;
  bg: string;
  fg: string;
  ms: number;
  tone: readonly Tone[];
}
export const ALERT_KINDS = ['stain', 'rescued', 'lootlost', 'dizzy', 'phase', 'hourglass'] as const satisfies readonly BuzzKind[];
export type AlertKind = (typeof ALERT_KINDS)[number];
export const isAlertKind = (k: string): k is AlertKind => (ALERT_KINDS as readonly string[]).includes(k);

// biome-ignore format: one notice per entry
export const ALERTS: Record<AlertKind, AlertSpec> = {
  stain: { title: '¡TE MANCHARON!', line: 'Quieto hasta que un compañero te rescate', bg: '#D7263D', fg: '#FFFFFF', ms: 1500, tone: [[330, 120, 'sawtooth'], [220, 120, 'sawtooth'], [150, 260, 'sawtooth']] },
  rescued: { title: '¡TE RESCATARON!', line: 'Libre: a pintar', bg: '#22B573', fg: '#052414', ms: 1300, tone: [[523, 90, 'triangle'], [659, 90, 'triangle'], [784, 90, 'triangle'], [1047, 220, 'triangle']] },
  lootlost: { title: '¡PERDISTE EL BOTÍN!', line: 'Tu sabotaje cayó al piso', bg: '#7B3FE4', fg: '#FFFFFF', ms: 1500, tone: [[392, 90, 'square'], [294, 90, 'square'], [196, 240, 'square']] },
  dizzy: { title: '¡MAREADO!', line: 'Stick al revés', bg: '#C2188E', fg: '#FFFFFF', ms: 1300, tone: [[440, 80, 'sine'], [587, 80, 'sine'], [415, 80, 'sine'], [554, 80, 'sine'], [392, 200, 'sine']] },
  phase: { title: '¡CAMBIO DE FASE!', line: 'Mira la tele', bg: '#FFD23F', fg: '#2B1B17', ms: 1400, tone: [[392, 110, 'square'], [523, 110, 'square'], [659, 110, 'square'], [784, 260, 'square']] },
  hourglass: { title: '¡RELOJ DE ARENA!', line: 'En disputa: ve al círculo', bg: '#0FA3B8', fg: '#FFFFFF', ms: 1800, tone: [[880, 70, 'square'], [660, 70, 'square'], [880, 70, 'square'], [660, 70, 'square'], [1175, 260, 'square']] },
};

/** A card that falls the instant its holder is stained: the two buzzes (stain, then lootlost) arrive together and are one notice, not two. */
export const FOLD_MS = 700;
export interface LastAlert {
  kind: AlertKind;
  at: number;
}
export function alertFor(kind: AlertKind, last: LastAlert | null, now: number): AlertSpec {
  const spec = ALERTS[kind];
  if (kind === 'lootlost' && last?.kind === 'stain' && now - last.at < FOLD_MS)
    return {
      ...ALERTS.stain,
      line: 'Y soltaste tu sabotaje: cayó al piso',
      ms: ALERTS.stain.ms + 300,
      tone: [...ALERTS.stain.tone, ...spec.tone.slice(-1)],
    };
  return spec;
}

let ctx: AudioContext | undefined;
/** Browsers only start sound after a touch: the first one on the pad unlocks it (the platform's own cue does the same for its tones). */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    /* no audio: the colour and the vibration still carry it */
  }
}
export function playTones(tones: readonly Tone[]) {
  if (ctx?.state !== 'running') return;
  let t = ctx.currentTime;
  for (const [f, ms, wave = 'triangle'] of tones) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
    t += ms / 1000 + 0.02;
  }
}
