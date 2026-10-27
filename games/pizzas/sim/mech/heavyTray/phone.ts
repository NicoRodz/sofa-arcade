// Heavy tray, the phone: the carrier is asked to call for help (amber), the helper is told how to let go (green). Pure read; `key` changes when the note changes.
import type { Game, Player } from '../../round/state';
import { carriesTray } from './state';

export interface PhoneNote {
  tone: 'amber' | 'green';
  label: string; // 14 characters at most (the hint label limit)
  sfx?: 'chime';
  key: string;
}
export function trayPhone(g: Game, p: Player): PhoneNote | null {
  const t = g.mech?.tray;
  if (!t) return null;
  if (t.helper === p.id) return { tone: 'green', label: 'A para soltar', key: 'tray-helper' };
  if (t.helper === null && carriesTray(g, p)) return { tone: 'amber', label: 'Pide ayuda', sfx: 'chime', key: 'tray-help' };
  return null;
}
