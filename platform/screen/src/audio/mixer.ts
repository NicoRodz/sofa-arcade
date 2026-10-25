// Pure mixing rules: bus levels, voice limits, loop streams, ducking, mute.
import { LOOPS, SFX, sfxDuration, type Action, type LoopId, type SfxId } from './recipes';

export const MASTER_GAIN = 0.9;
export const BUS_GAIN = { music: 0.35, sfx: 0.8, ui: 0.6 } as const;
export const COMPRESSOR = { threshold: -18, ratio: 4, attack: 0.003, release: 0.15 } as const;
export const DUCK_GAIN = 10 ** (-6 / 20); // -6 dB
export const DUCK_S = 0.4;
export const MAX_SAME = 3; // simultaneous instances of one sfx
export const DUPLICATE_S = 0.04; // a repeat inside this window is dropped

// Safety stage after the compressor: linear up to KNEE, then a smooth curve that never reaches 1.
export const KNEE = 0.7;
export const CEILING = 0.98;
export function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  const y = KNEE + (CEILING - KNEE) * Math.tanh((a - KNEE) / (CEILING - KNEE));
  return x < 0 ? -y : y;
}

export const masterGain = (muted: boolean) => (muted ? 0 : MASTER_GAIN);
export const rateFor = (id: SfxId, rand: number): number => 1 + (rand * 2 - 1) * ((SFX[id] as { pitchVar?: number }).pitchVar ?? 0);

export class SfxLimiter {
  private live = new Map<SfxId, { start: number; end: number }[]>();
  /** True when the sound may play at `now`; records it. */
  allow(id: SfxId, now: number): boolean {
    const list = (this.live.get(id) ?? []).filter((v) => v.end > now);
    this.live.set(id, list);
    if (list.some((v) => now - v.start < DUPLICATE_S)) return false;
    if (list.length >= MAX_SAME) return false;
    list.push({ start: now, end: now + sfxDuration(id) });
    return true;
  }
}

export interface Hit {
  at: number;
  sfx: SfxId;
}
export class LoopTable {
  private loops = new Map<string, { id: LoopId; next: number }>();
  start(key: string, id: LoopId, now: number): boolean {
    if (this.loops.has(key)) return false;
    let same = 0;
    for (const l of this.loops.values()) if (l.id === id) same++;
    if (same >= LOOPS[id].max) return false;
    this.loops.set(key, { id, next: now });
    return true;
  }
  stop(key: string) {
    this.loops.delete(key);
  }
  clear() {
    this.loops.clear();
  }
  get size() {
    return this.loops.size;
  }
  /** Hits that fall before now + lookahead; advances each loop past them. */
  due(now: number, lookahead: number, rand: () => number): Hit[] {
    const hits: Hit[] = [];
    for (const l of this.loops.values()) {
      const def = LOOPS[l.id];
      if (l.next < now) l.next = now; // never schedule in the past after a stall
      while (l.next < now + lookahead) {
        hits.push({ at: l.next, sfx: def.sfx });
        l.next += def.every(rand());
      }
    }
    return hits;
  }
  apply(a: Action, now: number) {
    if (a.kind === 'loopStart') this.start(a.key, a.loop, now);
    else if (a.kind === 'loopStop') this.stop(a.key);
    else if (a.kind === 'stopLoops') this.clear();
  }
}

export interface HintState {
  running: boolean;
  muted: boolean;
}
export const hintText = ({ running, muted }: HintState): string =>
  !running ? 'Haz clic para activar el sonido' : muted ? 'Sonido silenciado (M)' : '';
