// Arena's results: the winner and the order in which the others fell. The panel is built here (the page has no markup for this game) and sits above the button.
import { teamOf } from '@pichi/core/lobby';
import { app } from '@pichi/screen-kit/shell';
import { $, esc } from '@pichi/screen-kit/ui';
import { gridResultsHtml } from './grid/grid-results';
import { matchRun } from './match/run';
import { resultsHtml, resultsView } from './match/results';
import { gridRun } from './grid/grid-run';
import { run } from './run';

const slotName = (slot: number) => [...app.players.values()].find((p) => p.info.slot === slot)?.info.name ?? `J${slot + 1}`;

function panel(): HTMLElement {
  const old = document.getElementById('arenares');
  if (old) return old;
  const el = document.createElement('div');
  el.id = 'arenares';
  el.style.marginTop = '22px'; // the title's outline (14 px stroke) reaches past its box: without this it touched the first line
  $('again').before(el);
  return el;
}

export function renderResults() {
  const s = run.arena?.state;
  $('pizzares').classList.add('off');
  $('obstres').classList.add('off');
  $('vsres').replaceChildren();
  $('vsnote').textContent = '';
  $('resh').textContent = s?.winner == null ? 'Empate' : `¡Ganó ${slotName(s.winner)}!`;
  $('resh').style.color = '';
  const m = matchRun.run?.state;
  if (m) {
    const v = resultsView(m, app.config.teams ?? []);
    $('resh').textContent = v.heading;
    $('resh').style.color = v.color;
    panel().innerHTML = resultsHtml(v, esc);
    return;
  }
  if (gridRun.run) {
    $('resh').textContent = 'Prototipo F0: control';
    panel().innerHTML = gridResultsHtml(slotName, esc);
    return;
  }
  if (!s) return;
  const order = [...s.fighters].sort((a, b) => (b.fellAt ?? Infinity) - (a.fellAt ?? Infinity)); // still standing first, then the last to fall
  panel().innerHTML = order
    .map((f, i) => `<div class="arow"><b>${i + 1}</b> ${esc(slotName(f.slot))}${f.alive ? ' · en pie' : ''}</div>`)
    .join('');
}

export function clearResults() {
  document.getElementById('arenares')?.replaceChildren();
}

/** Score of a player's team: its painted tiles (Manchazo), or 1 for the winner of the pushing round. */
export const winsOf = (id: number): number => {
  const mr = matchRun.run?.state;
  if (mr) {
    const team = teamOf(app.config.teams, id)?.id;
    return team === undefined ? 0 : (mr.match.counts[team] ?? 0);
  }
  const s = run.arena?.state;
  const p = app.players.get(id);
  return s && p && s.winner === p.info.slot ? 1 : 0;
};
