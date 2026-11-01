// Pure HUD helpers (no Phaser): clock text and the medal thresholds of plan §8 (gold <= par, silver <= 1.5 par).
import { SILVER_PAR_MULT } from '../../../index';

export const clockText = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const medalFor = (timeSec: number, parSec: number): 'gold' | 'silver' | 'bronze' =>
  timeSec <= parSec ? 'gold' : timeSec <= parSec * SILVER_PAR_MULT ? 'silver' : 'bronze';
export const MEDAL_COLORS = { gold: 0xffc21a, silver: 0xc9d3da, bronze: 0xcd7f32 } as const;
