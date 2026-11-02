// For the capture tool only: the teams of the running round and a look set on a slot, so a sheet can show the same looks in both teams.
import type { Appearance } from '@pichi/core/avatar';
import type { ManchazoState } from '../../sim';

export function looksDebug(get: () => ManchazoState | null, looks: Map<number, Appearance>) {
  return {
    manchazoTeams: (): { slot: number; team: number }[] => get()?.grid.bodies.map((b) => ({ slot: b.slot, team: b.team })) ?? [],
    manchazoLook: (slot: number, ap: Appearance) => void looks.set(slot, ap),
  };
}
