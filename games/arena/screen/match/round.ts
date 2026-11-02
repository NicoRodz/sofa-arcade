// Which round Arena runs, read from the page's query string (lazily: nothing runs when the file loads). Manchazo is the default; `?control=A|B` keeps F0's
// control prototype (telemetry, no scoring) and `?round=push` the original pushing round, both for comparison.
import { gridPlan } from '../grid/mode';

export type RoundKind = 'manchazo' | 'grid' | 'push';

export function roundKind(search: string = location.search): RoundKind {
  if (new URLSearchParams(search).get('round') === 'push') return 'push';
  return gridPlan(search) ? 'grid' : 'manchazo';
}
