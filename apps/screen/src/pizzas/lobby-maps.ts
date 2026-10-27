// The Pizzas lobby's map panel: the cards, the preview, the seed, what the choice means for this group and the "can we start" state of the button.
// TRANSITIONAL (F4b): the tail of renderUi in apps/screen/src/main.ts, moved unchanged.
import { params } from '@pichi/core/difficulty';
import { app } from '@pichi/screen-kit/shell/app-state';
import { $, esc, setHtml } from '@pichi/screen-kit/ui/dom';
import { generate } from '@pichi/game-pizzas/sim/generate';
import { COOP_MAPS, SERIES_MAPS, fixedMap, lobbyMaps, mapFeatures, mapStatus } from '@pichi/game-pizzas/sim/maps';
import { VERSUS_AUTO, VERSUS_RANDOM, teamSizes, versusLobbyMaps } from '@pichi/game-pizzas/sim/versus/lobby';
import { versusMap } from '@pichi/game-pizzas/sim/versus/maps';
import { drawMiniMap } from '@pichi/game-pizzas/screen/art/ui';
import { startProblem, versusGenerated } from './lobby-sync';
import { pz } from './state';

let lastMapKey = '';

const isSeries = (id: string) => SERIES_MAPS.some((m) => m.id === id);

export function renderMapPanel(vs: boolean, n: number) {
  if (isSeries(app.config.map)) pz.mapGroup = 'series'; // a series map picked (or kept from the last round) shows its own set
  const sizes = teamSizes(app.config.teams);
  const rows = vs
    ? versusLobbyMaps(sizes).map(({ map, status }) => ({
        map,
        status: status.state === 'recommended' ? { state: 'recommended' as const } : status,
      }))
    : lobbyMaps(n, COOP_MAPS).filter(({ map }) => isSeries(map.id) === (pz.mapGroup === 'series'));
  const cards = rows.map(({ map, status }) => {
    const f = mapFeatures(map.rows);
    const cls = `mc ${status.state === 'recommended' ? 'rec' : status.state === 'warn' ? 'warn' : 'blk'} ${map.id === app.config.map ? 'sel' : ''}`;
    const tags = `${f.cheese ? '<i class="tag" title="Queso: Margarita">Q</i>' : ''}${f.sink ? '<i class="tag l" title="Lavado de platos">L</i>' : ''}`;
    return `<button class="${cls}" data-map="${map.id}"><span class="t"><b>${map.id}</b>${esc(map.name)}</span><span class="m">${map.nMin}-${map.nMax}<span class="st">${'★'.repeat(map.stars)}</span>${tags}</span>${status.state === 'recommended' ? '' : `<span class="why">${status.reason}</span>`}</button>`;
  });
  const special = (
    vs
      ? [
          [VERSUS_AUTO, 'Aleatorio', 'de los que caben'],
          [VERSUS_RANDOM, 'Mapa generado', 'semilla nueva'],
        ]
      : pz.mapGroup === 'series'
        ? [['group', '◂ Clásicos', 'los 19 de antes']]
        : [
            ['auto', 'Aleatorio', 'de los ideales'],
            ['random', 'Mapa generado', 'semilla nueva'],
            ['group', 'Carta larga ▸', 'platos nuevos'],
          ]
  ).map(
    ([id, label, sub]) =>
      `<button class="mc special ${id === app.config.map ? 'sel' : ''}" data-map="${id}"><span class="t">${label}</span><span class="m">${sub}</span></button>`,
  );
  setHtml('maps', [...cards, ...special].join(''));
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
