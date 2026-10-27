// "Your mate needs you": the phone of the chef called turns amber with a tone. The sim only says it (the event `mech:need`); the host maps it to the phone's alert buzz.
// The event is not in the typed GameEvents of core (a shared file): T1e asks for it in its report, so the emit goes through a plain interface until then.
import type { Game, Player } from '../../round/state';

interface Loose {
  emit(type: string, payload: unknown): void;
}
export type NeedKind = 'kneader' | 'woodOven';
export const emitMech = (g: Game, type: string, payload: unknown) => (g.bus as unknown as Loose).emit(type, payload);

/** The chef that is called: the lowest id that is not one of `except` (the ones already working on it) and is not a ghost. */
export function callOther(g: Game, kind: NeedKind, station: number, except: readonly number[]): number | null {
  const ids = [...g.players.values()].filter((p: Player) => !p.ghost && !except.includes(p.id)).map((p) => p.id);
  if (!ids.length) return null;
  const player = Math.min(...ids);
  emitMech(g, 'mech:need', { player, station, kind });
  return player;
}
