// Pizzas' results: the round summary (stars, score, stats, podium, kudos) or, in versus, the verdict (results-versus.ts).
// TRANSITIONAL (F4b): the pizza branch of renderResults in apps/screen/src/main.ts, moved unchanged.
import { chefCanvas } from '@pichi/screen-kit/art/chef';
import { laterInResults } from '@pichi/screen-kit/results/timers';
import { app, services } from '@pichi/screen-kit/shell/app-state';
import { $, esc, setHtml } from '@pichi/screen-kit/ui/dom';
import { kudosLines } from '@pichi/game-pizzas/sim/kudos';
import { summarize } from '@pichi/game-pizzas/sim/results';
import { cancelFlagLoop, renderVersusResults } from './results-versus';
import { kitchen, pz, stats } from './state';

function renderKudos() {
  // the extra lines of the results: empty (and hidden) when the round had no burn rules or nobody did any of it
  const lines = kudosLines(kitchen, (id) => app.players.get(id)?.info.name ?? 'Un chef');
  setHtml('kudos', lines.map((l) => `<div>${esc(l)}</div>`).join(''));
  $('kudos').classList.toggle('off', !lines.length);
}

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
  renderKudos();
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
  const [t1, t2, t3] = sum.thresholds;
  $('starline').innerHTML =
    sum.next === null ? '¡Tres estrellas!' : `Próxima estrella a <b>${sum.thresholds[st]}</b> · te faltaron <b>${sum.next}</b>`;
  $('starline').title = `★ ${t1} · ★★ ${t2} · ★★★ ${t3}`;
  const stat = (cls: string, v: number | string, label: string) => `<div class="stat ${cls}"><b>${v}</b><span>${label}</span></div>`;
  $('stats').innerHTML =
    stat('good', sum.delivered, 'Entregadas') +
    stat('gold', sum.bestStreak, 'Mejor racha') +
    stat('gold', sum.tips, 'En propinas') +
    stat('bad', sum.expired + sum.rejected, 'Falladas');
  const ranked = [...app.players.values()]
    .map((p) => ({ p, n: stats.delivered.get(p.info.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.p.info.slot - b.p.info.slot);
  const top = ranked.filter((r) => r.n > 0).slice(0, 3);
  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  const pod = $('podium');
  pod.replaceChildren();
  for (const i of order) {
    const r = top[i];
    if (!r) continue;
    const el = document.createElement('div');
    el.className = `pod p${i + 1}`;
    el.innerHTML = `${i === 0 ? '<div class="crown">👑</div>' : ''}<div class="step">${esc(r.p.info.name)}<small>${r.n} ${r.n === 1 ? 'pizza' : 'pizzas'}</small></div>`;
    el.insertBefore(chefCanvas(r.p.info.slot, 'happy', true), el.firstChild);
    pod.appendChild(el);
  }
  if (!top.length) pod.innerHTML = '<div class="hint">Nadie alcanzó a entregar una pizza</div>';
}
