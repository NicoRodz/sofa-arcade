// Registry schema of the votable options (design menus-desde-celular-votacion). Types and one pure helper; vote.ts re-exports them.
import type { IconId } from '../icons';

export interface OptionValue {
  id: string;
  label: string;
  icon?: IconId;
}
export interface OptionSpec {
  key: string;
  label: string;
  type: 'enum' | 'seed'; // seed is voted as "Aleatorio / Repetir / 3 sugeridas": the screen fills `values`
  values: readonly OptionValue[];
  default: string; // value id
  votable: boolean;
  parent?: string; // key of the option this one depends on: changing the parent resets this one's votes
  visibleIf?: (current: Readonly<Record<string, string>>) => boolean; // e.g. teams only if mode is versus; evaluated on the screen
  availableFor?: (nPlayers: number) => boolean; // evaluated on the screen
}
/** Keys that depend (transitively) on `key`: their votes must be cleared when `key` changes. */
export function dependentKeys(specs: readonly OptionSpec[], key: string): string[] {
  const out: string[] = [];
  const walk = (k: string) => {
    for (const s of specs)
      if (s.parent === k && !out.includes(s.key)) {
        out.push(s.key);
        walk(s.key);
      }
  };
  walk(key);
  return out;
}
