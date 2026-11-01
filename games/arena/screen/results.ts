// Arena's results: the winner and the order in which the others fell. The panel is built here (the page has no markup for this game) and sits above the button.
import { app } from '@pichi/screen-kit/shell';
import { $, esc } from '@pichi/screen-kit/ui';
import { run } from './run';

const slotName = (slot: number) => [...app.players.values()].find((p) => p.info.slot === slot)?.info.name ?? `J${slot + 1}`;

function panel(): HTMLElement {
  const old = document.getElementById('arenares');
  if (old) return old;
  const el = document.createElement('div');
  el.id = 'arenares';
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
  if (!s) return;
  const order = [...s.fighters].sort((a, b) => (b.fellAt ?? Infinity) - (a.fellAt ?? Infinity)); // still standing first, then the last to fall
  panel().innerHTML = order
    .map((f, i) => `<div class="arow"><b>${i + 1}</b> ${esc(slotName(f.slot))}${f.alive ? ' · en pie' : ''}</div>`)
    .join('');
}

export function clearResults() {
  document.getElementById('arenares')?.replaceChildren();
}

export const winsOf = (id: number): number => {
  const s = run.arena?.state;
  const p = app.players.get(id);
  return s && p && s.winner === p.info.slot ? 1 : 0;
};
