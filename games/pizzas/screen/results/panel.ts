// Pizzas' results: the round summary (stars, score, stats, podium, kudos) or, in versus, the verdict (versus-view.ts).
import { kudosView, laterInResults, renderKudos } from '@pichi/screen-kit/results';
import { app, services } from '@pichi/screen-kit/shell';
import { $ } from '@pichi/screen-kit/ui';
import { kudosLines } from '../../sim/scoring/kudos';
import { summarize } from '../../sim/scoring/results';
import { summaryView } from './model';
import { cancelFlagLoop, renderVersusResults } from './versus-view';
import { renderSummary } from './view';
import { kitchen, pz, stats } from '../state';

// the extra lines of the results: empty (and hidden) when the round had no burn rules or nobody did any of it
const showKudos = () => renderKudos(kudosView(kudosLines(kitchen, (id) => app.players.get(id)?.info.name ?? 'Un chef')));

export function renderResults() {
  cancelFlagLoop();
  $('kudos').classList.add('off'); // the pizza results turn it on when there is something to say
  $('campres').classList.toggle('off', true);
  $('resh').classList.toggle('off', false);
  $('again').classList.toggle('off', false);
  $('pizzares').classList.remove('off');
  $('obstres').classList.add('off');
  $('resultsInner').classList.toggle('vs', pz.game.versus);
  if (!pz.game.versus) pz.report = null;
  showKudos();
  $('resh').className = '';
  $('resultsInner').classList.remove('revealed');
  if (pz.game.versus) {
    renderVersusResults();
    return;
  }
  $('resh').textContent = '¡Fin de la ronda!';
  $('resh').style.color = '';
  const sum = summarize(pz.game);
  const st = sum.stars;
  const starsEl = $('stars');
  starsEl.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const cv = services.starCanvas();
    if (i >= st) cv.classList.add('off2');
    starsEl.appendChild(cv);
    laterInResults(() => cv.classList.add('drop'), 500 + i * 550);
  }
  const target = pz.game.score,
    t0 = performance.now() + 400,
    dur = 1300;
  const fin = $('finalscore');
  const step = () => {
    const k = Math.max(0, Math.min(1, (performance.now() - t0) / dur));
    fin.textContent = String(Math.round(target * (1 - (1 - k) ** 3)));
    if (k < 1 && app.phase === 'results') requestAnimationFrame(step);
  };
  step();
  const ranked = [...app.players.values()]
    .map((p) => ({ slot: p.info.slot, name: p.info.name, delivered: stats.delivered.get(p.info.id) ?? 0 }))
    .sort((a, b) => b.delivered - a.delivered || a.slot - b.slot);
  renderSummary(summaryView(sum, ranked));
}
