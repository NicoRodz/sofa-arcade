// Obstaculos' results: the expedition summary (stars, score, one card per level, awards) or, after a campaign level, the campaign's panel.
// Moved out of apps/screen/src/main.ts (F4b): renderObstResults and the Obstaculos branches of renderResults.
import { app, services } from '@pichi/screen-kit/shell';
import { laterInResults } from '@pichi/screen-kit/results';
import { $ } from '@pichi/screen-kit/ui';
import { camp } from './campaign-link';
import { levelCard, awardCards } from './results/model';
import { renderExpedition } from './results/view';
import { biomeColor, run, slotName } from './run-state';

function renderObstResults() {
  const sum = run.summary ?? run.obst?.session.summary();
  if (!sum) return;
  $('resh').textContent = sum.reason === 'complete' ? '¡Expedición completa!' : 'Expedición terminada';
  $('resh').style.color = '';
  $('pizzares').classList.add('off');
  $('obstres').classList.remove('off');
  $('vsres').replaceChildren();
  $('vsnote').textContent = '';
  const starsEl = $('ostars');
  starsEl.replaceChildren();
  for (let i = 0; i < sum.expedition; i++) {
    const cv = services.starCanvas();
    if (i >= sum.cleared) cv.classList.add('off2');
    starsEl.appendChild(cv);
    laterInResults(() => cv.classList.add('drop'), 500 + i * 550);
  }
  const fin = $('ofinalscore'),
    t0 = performance.now() + 400,
    dur = 1300;
  const step = () => {
    const k = Math.max(0, Math.min(1, (performance.now() - t0) / dur));
    fin.textContent = String(Math.round(sum.score * (1 - (1 - k) ** 3)));
    if (k < 1 && app.phase === 'results') requestAnimationFrame(step);
  };
  step();
  renderExpedition(
    sum.levels.map((l) => levelCard(l, biomeColor[l.biome])),
    awardCards(sum.awards, slotName),
  );
}

export function renderResults() {
  const campResults = camp.resultOn;
  $('kudos').classList.add('off'); // the pizza results turn it on when there is something to say
  $('campres').classList.toggle('off', !campResults);
  $('resh').classList.toggle('off', campResults);
  $('again').classList.toggle('off', campResults);
  if (campResults) {
    $('resultsInner').classList.remove('vs');
    $('pizzares').classList.add('off');
    $('obstres').classList.add('off');
    $('vsres').replaceChildren();
    $('vsnote').textContent = '';
    camp.renderResults();
    return;
  }
  $('resultsInner').classList.remove('vs');
  renderObstResults();
}
