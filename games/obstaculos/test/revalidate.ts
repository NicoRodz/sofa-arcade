import { parseLevel } from '../parse';
import { modesOf, validateState } from '../validator';
import type { generateLevel, GenerateOpts } from '../generate/generate';

// An independent check: parse + the validator again on the level the generator handed back, for its own n, mode(s) and difficulty.
export function revalidate(o: GenerateOpts, rows: string[], level: ReturnType<typeof generateLevel>['level']): string[] {
  const errors: string[] = [...parseLevel(level).errors];
  for (const mode of modesOf(level)) {
    const r = validateState(level, { n: o.n, mode, diff: o.difficulty });
    if (!r.ok) errors.push(`${mode}: ${r.errors.join('; ')}`);
  }
  if (rows.length !== 18) errors.push(`rows ${rows.length}`);
  return errors;
}
