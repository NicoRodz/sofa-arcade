// Obstaculos' results: the expedition summary (stars, score, one card per level, awards) or, after a campaign level, the campaign's panel.
// Moved out of apps/screen/src/main.ts (F4b): renderObstResults and the Obstaculos branches of renderResults.
import { chefCanvas } from '@pichi/screen-kit/art/chef';
import { app, services } from '@pichi/screen-kit/shell';
import { laterInResults } from '@pichi/screen-kit/results';
import { $, esc } from '@pichi/screen-kit/ui';
import { camp } from './campaign-link';
import { biomeColor, run, slotName } from './run-state';

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const AWARDS: { key: 'ancla' | 'taxi' | 'coleccionista' | 'kamikaze' | 'pegamento'; label: string; why: string }[] = [
  { key: 'ancla', label: 'Ancla', why: 'más tiempo agarrado a una argolla' },
  { key: 'taxi', label: 'Taxi', why: 'lanzamientos y manos' },
  { key: 'coleccionista', label: 'Coleccionista', why: 'más estrellas' },
  { key: 'kamikaze', label: 'Kamikaze', why: 'más caídas' },
  { key: 'pegamento', label: 'Pegamento', why: 'menos tiempo fuera de cámara' },
];

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
  const medal = { gold: ['gold', 'O'], silver: ['silver', 'P'], bronze: ['bronze', 'B'] } as const;
  $('olevels').innerHTML = sum.levels
    .map((l) => {
      const m = l.medal ? medal[l.medal] : ['none', '✕'];
      return (
        `<div class="olv${l.cleared ? '' : ' lost'}"><div class="h"><span class="medal ${m[0]}">${m[1]}</span>${esc(l.name)}</div>` +
        `<div class="sub"><i class="bio" style="background:${biomeColor[l.biome]}"></i>Nivel ${l.index + 1}${l.retry ? ' · reintento ×0,5' : ''}${l.cleared ? '' : ' · sin vidas'}</div>` +
        `<div class="row"><span>Tiempo</span><span>${clock(l.timeSec)} / par ${clock(l.parSec)}</span></div>` +
        `<div class="row"><span>Estrellas</span><span>${l.stars}/${l.starsMax} ★</span></div>` +
        `<div class="row"><span>Vidas</span><span>${Number.isFinite(l.livesLeft) ? `${l.livesLeft}` : '∞'} · caídas ${l.deaths}</span></div>` +
        `<div class="row"><span>Checkpoints</span><span>${l.checkpoints}/${l.checkpointsMax}</span></div>` +
        `<div class="pts">${l.cleared ? '+' : ''}${l.score}</div></div>`
      );
    })
    .join('');
  const aw = $('oawards');
  aw.replaceChildren();
  for (const a of AWARDS) {
    const slot = sum.awards[a.key];
    if (slot === null) continue;
    const el = document.createElement('div');
    el.className = 'award';
    el.title = a.why;
    el.innerHTML = `<div><small>${a.label}</small>${esc(slotName(slot))}</div>`;
    el.insertBefore(chefCanvas(slot, 'happy', true), el.firstChild);
    aw.appendChild(el);
  }
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
