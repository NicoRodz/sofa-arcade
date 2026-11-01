// What Obstaculos' results panel shows for the expedition cards and the awards, as plain data: the template (view.ts) only draws it.
import type { Awards, RunSummary } from '../../index';

type LevelSummary = RunSummary['levels'][number];

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export const AWARDS: { key: keyof Awards; label: string; why: string }[] = [
  { key: 'ancla', label: 'Ancla', why: 'más tiempo agarrado a una argolla' },
  { key: 'taxi', label: 'Taxi', why: 'lanzamientos y manos' },
  { key: 'coleccionista', label: 'Coleccionista', why: 'más estrellas' },
  { key: 'kamikaze', label: 'Kamikaze', why: 'más caídas' },
  { key: 'pegamento', label: 'Pegamento', why: 'menos tiempo fuera de cámara' },
];
const MEDAL = { gold: ['gold', 'O'], silver: ['silver', 'P'], bronze: ['bronze', 'B'] } as const;

export interface LevelCard {
  lost: boolean;
  medalCls: string;
  medalGlyph: string;
  name: string;
  biomeColor: string;
  sub: string; // "Nivel 2 · reintento ×0,5 · sin vidas"
  time: string;
  stars: string;
  lives: string;
  checkpoints: string;
  pts: string;
}
export interface AwardCard {
  label: string;
  why: string;
  slot: number;
  name: string;
}

export const levelCard = (l: LevelSummary, biomeColor: string): LevelCard => {
  const m = l.medal ? MEDAL[l.medal] : (['none', '✕'] as const);
  return {
    lost: !l.cleared,
    medalCls: m[0],
    medalGlyph: m[1],
    name: l.name,
    biomeColor,
    sub: `Nivel ${l.index + 1}${l.retry ? ' · reintento ×0,5' : ''}${l.cleared ? '' : ' · sin vidas'}`,
    time: `${clock(l.timeSec)} / par ${clock(l.parSec)}`,
    stars: `${l.stars}/${l.starsMax} ★`,
    lives: `${Number.isFinite(l.livesLeft) ? `${l.livesLeft}` : '∞'} · caídas ${l.deaths}`,
    checkpoints: `${l.checkpoints}/${l.checkpointsMax}`,
    pts: `${l.cleared ? '+' : ''}${l.score}`,
  };
};

// Awards nobody won (null slot) are left out.
export const awardCards = (awards: Awards, slotName: (slot: number) => string): AwardCard[] =>
  AWARDS.flatMap((a) => {
    const slot = awards[a.key];
    return slot === null ? [] : [{ label: a.label, why: a.why, slot, name: slotName(slot) }];
  });
