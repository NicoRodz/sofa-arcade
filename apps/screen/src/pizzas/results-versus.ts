// Versus results (F4): the verdict, one card per team, the series of the session. The numbers come from versusReport (shared, tested);
// this only lays them out. A short reveal: the scores count up from 0, then the winner's card lights up and the loser's slumps.
// TRANSITIONAL (F4b): moved out of apps/screen/src/main.ts unchanged, with the rematch buttons.
import { chefCanvas } from '@pichi/screen-kit/art/chef';
import { laterInResults } from '@pichi/screen-kit/results/timers';
import { app, dispatch, services } from '@pichi/screen-kit/shell/app-state';
import { $, esc } from '@pichi/screen-kit/ui/dom';
import { FLAG_H, FLAG_W, drawFlag, type FlagMood } from '@pichi/game-pizzas/screen/art/flags';
import { recordRound, seriesLine, versusReport } from '@pichi/game-pizzas/sim/versus/report';
import { resultNote } from '@pichi/game-pizzas/sim/versus/notes';
import { versusMap } from '@pichi/game-pizzas/sim/versus/maps';
import type { LobbyConfig } from '@pichi/core';
import { startProblem, shuffleTeams } from './lobby-sync';
import { resetFocus } from './key-nav';
import { isVersus, pz, stats } from './state';

const lightOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const m = (v: number) => Math.min(255, Math.round(v + (255 - v) * 0.5));
  return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
};
const ordinal = (rank: number) => `${rank}º`;
let flagLoop = 0;
export const cancelFlagLoop = () => cancelAnimationFrame(flagLoop);

export function renderVersusResults() {
  const teams = pz.roundView.teams ?? [];
  const rep = versusReport(pz.game, teams, stats.delivered);
  pz.report = rep;
  const counted = rep.verdict === 'win' || rep.verdict === 'draw';
  pz.series = counted || pz.series ? recordRound(pz.series, teams, rep.verdict, rep.winner) : pz.series;
  const names = teams.map((t) => t.name);
  const head = $('resh');
  head.className = 'vsh';
  head.textContent = '¡Y el resultado es…!';
  head.style.color = '';
  $('vsnote').textContent = '';
  const w = rep.winner !== null ? rep.teams[rep.winner] : null;
  const verdictText =
    rep.verdict === 'win'
      ? `¡Ganan los ${w?.name ?? 'del equipo ' + (rep.winner! + 1)}!`
      : rep.verdict === 'draw'
        ? '¡Empate!'
        : rep.verdict === 'aborted'
          ? 'Partida terminada'
          : 'Partida sin ganador';
  const noteText = resultNote(rep);
  const row = (cls: string, label: string, v: number | string) => `<div class="vr ${cls}"><span>${label}</span><b>${v}</b></div>`;
  const slotOf = (id: number) => app.players.get(id)?.info.slot ?? 0;
  $('vsres').innerHTML = rep.teams
    .map((t) => {
      const mvp = t.mvp
        ? `<div class="vmvp"><span class="mvpav" data-slot="${slotOf(t.mvp.playerId)}"></span><div><small>MVP</small>${esc(app.players.get(t.mvp.playerId)?.info.name ?? 'Chef')} · ${t.mvp.delivered} ${t.mvp.delivered === 1 ? 'pizza' : 'pizzas'}</div></div>`
        : '<div class="vmvp"><div class="none">Nadie alcanzó a entregar</div></div>';
      return (
        `<div class="vteam" data-team="${t.teamId}" style="--tc:${t.color}"><div class="vh"><span class="vi">${esc(t.icon)}</span>${esc(t.name)}<span class="vc">👑</span>${counted ? `<span class="rk">${ordinal(t.rank)}</span>` : ''}</div>` +
        `<div class="vtop"><canvas class="vflag" width="${FLAG_W * 2}" height="${FLAG_H * 2}"></canvas><div class="vmid"><div class="vs" data-to="${t.score}">0</div><div class="vk">${t.k > 1 ? `ventaja ×${String(t.k).replace('.', ',')} sobre ${t.gross}` : ''}</div><div class="vstars"></div></div></div>` +
        `${row('', 'Pedidos entregados', t.delivered)}${row('', 'Mejor racha', t.bestStreak)}${row('g', 'Pedidos dorados ganados', t.vips)}${row('', 'En propinas', t.tips)}${row('b', 'Falladas', t.expired + t.rejected)}${mvp}</div>`
      );
    })
    .join('');
  resetFocus('results');
  const line = seriesLine(pz.series, names);
  $('vsseries').innerHTML = line ? `<small>Serie</small>${esc(line)}` : '';
  // the flags wave (winner), hang (loser) or rest, redrawn every frame while the screen is up
  cancelAnimationFrame(flagLoop);
  const cards = Array.from($('vsres').querySelectorAll<HTMLElement>('.vteam'));
  const moods = (id: number): FlagMood => (rep.winner === null ? 'idle' : id === rep.winner ? 'wave' : 'droop');
  const t0 = performance.now();
  const paint = () => {
    for (const el of cards) {
      const id = Number(el.dataset.team),
        cv = el.querySelector('canvas.vflag') as HTMLCanvasElement,
        c = cv.getContext('2d')!;
      c.setTransform(2, 0, 0, 2, 0, 0);
      c.clearRect(0, 0, FLAG_W, FLAG_H);
      drawFlag(c, {
        color: rep.teams[id]!.color,
        glyph: rep.teams[id]!.icon,
        mood: performance.now() - t0 < 1900 ? 'idle' : moods(id),
        t: (performance.now() - t0) / 1000,
      });
    }
    if (app.phase === 'results') flagLoop = requestAnimationFrame(paint);
  };
  paint();
  for (const el of Array.from($('vsres').querySelectorAll<HTMLElement>('.mvpav')))
    el.replaceChildren(chefCanvas(Number(el.dataset.slot), 'happy', true));
  // the reveal
  const t1 = performance.now() + 400,
    dur = 1300;
  const step = () => {
    const k = Math.max(0, Math.min(1, (performance.now() - t1) / dur));
    for (const el of cards) {
      const sc = el.querySelector('.vs') as HTMLElement;
      sc.textContent = String(Math.round(Number(sc.dataset.to) * (1 - (1 - k) ** 3)));
    }
    if (k < 1 && app.phase === 'results') requestAnimationFrame(step);
  };
  step();
  cards.forEach((el) => {
    const t = rep.teams[Number(el.dataset.team)]!;
    const stars = el.querySelector('.vstars')!;
    for (let i = 0; i < 3; i++) {
      const cv = services.starCanvas();
      if (i >= t.stars) cv.classList.add('off2');
      stars.appendChild(cv);
      laterInResults(() => cv.classList.add('drop'), 700 + i * 260);
    }
  });
  laterInResults(() => {
    $('resultsInner').classList.add('revealed');
    head.textContent = verdictText;
    head.style.color = w ? lightOf(w.color) : '';
    $('vsnote').innerHTML = noteText;
    for (const el of cards) {
      const id = Number(el.dataset.team);
      el.classList.toggle('win', rep.winner === id);
      el.classList.toggle('lose', rep.winner !== null && rep.winner !== id);
    }
  }, 1900);
}

// Versus results: Revancha (same teams, same map, straight into the next round), Cambiar equipos (back to the lobby with the players dealt again), Volver al lobby (teams as they were).
export function rematch() {
  if (app.phase !== 'results' || app.starting || !pz.game.versus) return;
  app.starting = true;
  if (versusMap(pz.game.mapId ?? '')) {
    pz.mapTouched = true;
    app.config = { ...app.config, map: pz.game.mapId as LobbyConfig['map'] };
  } // the same kitchens (a generated map keeps its seed)
  services.iris(
    () => {
      dispatch('again');
      if (isVersus() && !startProblem()) {
        dispatch('start');
        app.gateUntil = performance.now() + 700;
      } // a player left and the split is not legal any more: the lobby says why
    },
    () => {
      app.starting = false;
    },
  );
}
function newTeams() {
  if (app.phase !== 'results' || app.starting || !pz.game.versus) return;
  app.starting = true;
  services.iris(
    () => {
      dispatch('again');
      shuffleTeams();
    },
    () => {
      app.starting = false;
    },
  );
}

export function initVersusResults() {
  $('vs-rematch').addEventListener('click', rematch);
  $('vs-shuffle').addEventListener('click', newTeams);
  $('vs-lobby').addEventListener('click', () => {
    if (app.phase === 'results' && !app.starting) dispatch('again');
  });
}
