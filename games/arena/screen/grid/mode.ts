// F0 switch: the grid prototype replaces Arena's pushing round only when the page opens with `?control=A` or `?control=B` (A is the default plan,
// B auto-advance). Without the param Arena is exactly what it was. Read lazily: nothing runs when the file loads.
import type { ControlPlan } from '../../sim';

export function gridPlan(search: string = location.search): ControlPlan | null {
  const v = new URLSearchParams(search).get('control')?.toUpperCase();
  return v === 'A' || v === 'B' ? v : null;
}
