// What the phone of a chef should flag because of a map mechanic right now (the pure reads of each module: the porter in blue, a door about to shut, the belt that turns, a cold oven). The host turns a CHANGE of
// `key` into the attention buzz (colour + sound on the phone), once per change: a note that stays the same does not buzz again.
import type { Game, Player } from '../round/state';
import { gatePhone } from './gate/phone';
import { beltPhone } from './beltReverse/phone';
import { heatPhone } from './ovenHeat/phone';
import { trayPhone } from './heavyTray/phone';

export interface PhoneNote {
  tone: string;
  label: string;
  sfx?: string;
  key: string;
}
export function phoneNoteOf(g: Game, p: Player): PhoneNote | null {
  if (!g.mech || p.ghost) return null;
  return gatePhone(g, p) ?? beltPhone(g, p) ?? heatPhone(g, p) ?? trayPhone(g, p);
}

/** Per chef: the key of the last note sent. `sync` returns the ids to buzz now (a new note appeared or changed). */
export function createMechPhone() {
  const last = new Map<number, string>();
  return {
    sync(g: Game | null): number[] {
      if (!g?.mech) {
        last.clear();
        return [];
      }
      const out: number[] = [];
      for (const p of g.players.values()) {
        const key = phoneNoteOf(g, p)?.key ?? '';
        if (key && key !== last.get(p.id)) out.push(p.id);
        last.set(p.id, key);
      }
      return out;
    },
  };
}
