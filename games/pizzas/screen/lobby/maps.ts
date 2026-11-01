// The Pizzas lobby's map panel: the cards, the preview, the seed, what the choice means for this group and the "can we start" state of the button.
import { params } from '@pichi/core';
import { app } from '@pichi/screen-kit/shell';
import { $ } from '@pichi/screen-kit/ui';
import { generate } from '../../sim/generate';
import { coopLobbyView, fixedMap, lobbyGroupOfMap, mapStatus, recommendedForN } from '../../sim/maps';
import { VERSUS_AUTO, VERSUS_RANDOM, teamSizes, versusLobbyMaps } from '../../sim/versus/lobby';
import { versusMap } from '../../sim/versus/maps';
import { drawMiniMap } from '../art/dom/ui';
import { mapItems, type CardRow } from './maps-model';
import { renderMapItems } from './maps-view';
import { startProblem, versusGenerated } from './sync';
import { pz } from '../state';

let lastMapKey = '';

export function renderMapPanel(vs: boolean, n: number) {
  // "Recomendados para N" tops the home page: a recommended map picked from it keeps the page; any other map off the classics shows its own set
  const rec = vs ? [] : recommendedForN(n, app.config.difficulty, { played: pz.played, last: pz.autoLast });
  const picked = lobbyGroupOfMap(app.config.map);
  if (picked !== 'classic' && !(pz.mapGroup === 'classic' && rec.some((m) => m.id === app.config.map))) pz.mapGroup = picked;
  const sizes = teamSizes(app.config.teams);
  const rows: CardRow[] = vs ? versusLobbyMaps(sizes) : [];
  const view = vs ? null : coopLobbyView(n, pz.mapGroup, rec, app.config.map, pz.showOthers); // a recommended map shows once, under its label, never again in the list
  // Coop: the maps that cannot be picked for this group fold into "Otros mapas (N)" at the end (a click unfolds them; the selected one never hides)
  const { top, shown: listed, folded, unfolded } = view ?? { top: [], shown: rows, folded: [], unfolded: false };
  renderMapItems(mapItems({ vs, n, selected: app.config.map, page: pz.mapGroup, top, shown: listed, folded, unfolded }));
  $('mapfor').textContent = vs && sizes.length ? `· para ${sizes.join(' contra ')}` : `· para ${n} ${n === 1 ? 'jugador' : 'jugadores'}`;
  const rand = app.config.map === 'random' || app.config.map === VERSUS_RANDOM;
  $('seedrow').classList.toggle('off', !rand);
  $('seed').textContent = String(app.config.seed);
  const gen = rand && !vs ? generate(app.config.seed, app.config.difficulty, n) : null;
  const vsGen = rand && vs ? versusGenerated(app.config.seed, app.config.difficulty, sizes) : null;
  const shown = vsGen
    ? { rows: vsGen.rows }
    : gen
      ? { rows: gen.rows }
      : app.config.map === 'auto' || app.config.map === VERSUS_AUTO
        ? null
        : vs
          ? (versusMap(app.config.map) ?? null)
          : fixedMap(app.config.map);
  const key = shown ? shown.rows.join('') : 'none';
  if (key !== lastMapKey) {
    lastMapKey = key;
    const cv = $('minimap') as HTMLCanvasElement;
    if (shown) drawMiniMap(cv, shown.rows);
    else {
      const c = cv.getContext('2d')!;
      c.fillStyle = '#3A2A24';
      c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#FFF4E0';
      c.font = '800 54px ui-rounded, system-ui';
      c.textAlign = 'center';
      c.fillText('?', cv.width / 2, cv.height / 2 + 18);
    }
  }
  const sel = vs || app.config.map === 'auto' || app.config.map === 'random' ? null : fixedMap(app.config.map);
  const selStatus = sel ? mapStatus(sel, n) : null;
  const info = $('mapinfo');
  info.textContent =
    pz.mapNotice ||
    (gen && !gen.inBand
      ? 'Esta semilla no cae en la banda de la dificultad: se usa el mapa válido más cercano'
      : selStatus?.state === 'warn'
        ? `${sel!.name}: ${selStatus.reason}. Con ${n} se puede, pero cuesta`
        : '');
  info.classList.toggle('notice', !!pz.mapNotice);
  const pr = params(app.config.difficulty, vs ? Math.round(sizes.reduce((a, b) => a + b, 0) / Math.max(1, sizes.length)) : n);
  const di = $('diffinfo');
  di.textContent =
    pz.teamNotice ||
    `Pedido cada ${(pr.orderEveryMs / 1000).toFixed(0)} s, paciencia ${pr.orderTtlMs / 1000} s, hasta ${pr.maxOrders} pedidos`;
  di.classList.toggle('notice', !!pz.teamNotice);
  ($('start') as HTMLButtonElement).disabled = !!startProblem();
}
