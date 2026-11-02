// Results of the F0 prototype round: no winner yet (scoring is F1), only the failed-turn table that decides plan A or B.
import { turnReport } from '../../sim';
import { gridRun } from './grid-run';

export function gridResultsHtml(name: (slot: number) => string, esc: (s: string) => string): string {
  const s = gridRun.run?.state;
  if (!s) return '';
  const r = turnReport(s);
  const rows = s.bodies
    .map(
      (b) =>
        `<div class="arow"><b>${esc(name(b.slot))}</b> giros ${b.stats.requested} · fallidos ${b.stats.failed} · cancelados ${b.stats.cancelled}</div>`,
    )
    .join('');
  return `<div class="arow"><b>Control ${s.control}</b> · giros fallidos ${(r.failedRate * 100).toFixed(1)} % (${r.failed}/${r.requested})</div>${rows}`;
}
