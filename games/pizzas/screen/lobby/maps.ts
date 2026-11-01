// The Pizzas lobby's map panel: the cards, the preview, the seed, what the choice means for this group and the "can we start" state of the button.
import { params } from '@pichi/core';
import { app } from '@pichi/screen-kit/shell';
import { $, esc, setHtml } from '@pichi/screen-kit/ui';
import { generate } from '../../sim/generate';
import type { MapDef } from '../../sim/maps/types';
import { coopLobbyView, fixedMap, lobbyGroupOfMap, mapFeatures, mapStatus, type MapStatus, recommendedForN } from '../../sim/maps';
import { VERSUS_AUTO, VERSUS_RANDOM, teamSizes, versusLobbyMaps } from '../../sim/versus/lobby';
import { versusMap } from '../../sim/versus/maps';
import { drawMiniMap } from '../art/ui';
import { startProblem, versusGenerated } from './sync';
import { pz } from '../state';

let lastMapKey = '';
type CardRow = { map: Pick<MapDef, 'id' | 'name' | 'nMin' | 'nMax' | 'stars' | 'rows'>; status: MapStatus };

export function renderMapPanel(vs: boolean, n: number) {
  // "Recomendados para N" tops the home page: a recommended map picked from it keeps the page; any other map off the classics shows its own set
  const rec = vs ? [] : recommendedForN(n, app.config.difficulty, { played: pz.played, last: pz.autoLast });
  const picked = lobbyGroupOfMap(app.config.map);
  if (picked !== 'classic' && !(pz.mapGroup === 'classic' && rec.some((m) => m.id === app.config.map))) pz.mapGroup = picked;
  const sizes = teamSizes(app.config.teams);
  const rows: CardRow[] = vs ? versusLobbyMaps(sizes) : [];
  const view = vs ? null : coopLobbyView(n, pz.mapGroup, rec, app.config.map, pz.showOthers); // a recommended map shows once, under its label, never again in the list
  const card = ({ map, status }: CardRow, star = false) => {
    const f = mapFeatures(map.rows);
    const cls = `mc${star ? ' top' : ''} ${status.state === 'recommended' ? 'rec' : status.state === 'warn' ? 'warn' : 'blk'} ${map.id === app.config.map ? 'sel' : ''}`;
    const tags = `${f.cheese ? '<i class="tag" title="Queso: Margarita">Q</i>' : ''}${f.sink ? '<i class="tag l" title="Lavado de platos">L</i>' : ''}`;
    return `<button class="${cls}" data-map="${map.id}"><span class="t"><b>${map.id}</b>${esc(map.name)}</span><span class="m">${map.nMin}-${map.nMax}<span class="st">${'★'.repeat(map.stars)}</span>${tags}</span>${status.state === 'recommended' ? '' : `<span class="why">${status.reason}</span>`}</button>`;
  };
  // Coop: the maps that cannot be picked for this group fold into "Otros mapas (N)" at the end (a click unfolds them; the selected one never hides)
  const { top, shown: listed, folded, unfolded } = view ?? { top: [], shown: rows, folded: [], unfolded: false };
  // "Recomendados para N" is one band of up to three cards under its label; the rest of the page flows next to it
  const cards = [
    ...(top.length
      ? [`<div class="band"><div class="grp">Recomendados para ${n}</div>${top.map((r) => card(r, true)).join('')}</div>`]
      : []),
    ...listed.map((r) => card(r)),
  ];
  const others = folded.length
    ? [
        `<button class="mc special" data-map="group" data-to="others"><span class="t">${unfolded ? '◂ Ocultar otros' : `Otros mapas (${folded.length}) ▸`}</span><span class="m">no sirven con ${n}</span></button>`,
      ]
    : [];
  const special = (
    vs
      ? [
          [VERSUS_AUTO, 'Aleatorio', 'de los que caben'],
          [VERSUS_RANDOM, 'Mapa generado', 'semilla nueva'],
        ]
      : pz.mapGroup !== 'classic'
        ? [['group', '◂ Inicio', 'recomendados y clásicos', 'classic']]
        : [
            ['auto', 'Aleatorio', 'de los ideales'],
            ['random', 'Mapa generado', 'semilla nueva'],
            ['group', 'Carta larga ▸', 'platos nuevos', 'series'],
            ['group', 'Taller ▸', 'mecánicas nuevas', 'taller'],
            ['group', 'Sin dinámica ▸', 'los 6 simples', 'plain'],
          ]
  ).map(
    ([id, label, sub, to]) =>
      `<button class="mc special ${id === app.config.map ? 'sel' : ''}" data-map="${id}"${to ? ` data-to="${to}"` : ''}><span class="t">${label}</span><span class="m">${sub}</span></button>`,
  );
  setHtml('maps', [...cards, ...special, ...others].join(''));
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
