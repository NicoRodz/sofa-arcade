// What the Pizzas lobby's map panel shows (the cards, the "Recomendados para N" band, the special cards and the fold of "Otros mapas") as plain data: maps-view.ts
// only draws it. A pure function of the lobby's state, tested without a DOM. Every state a card can have (selected, recommended, warn, blocked, folded) is a field
// here, never a class written by hand: the next render redraws it from the same inputs.
import type { MapDef } from '../../sim/maps/types';
import { mapFeatures, type MapStatus } from '../../sim/maps';
import { VERSUS_AUTO, VERSUS_RANDOM } from '../../sim/versus/lobby';

export type MapGroupPage = 'classic' | 'series' | 'taller' | 'plain';
export type CardRow = { map: Pick<MapDef, 'id' | 'name' | 'nMin' | 'nMax' | 'stars' | 'rows'>; status: MapStatus };

export interface CardView {
  id: string;
  name: string;
  range: string; // "4-8"
  stars: string; // "★★★"
  cheese: boolean; // the Q tag
  sink: boolean; // the L tag
  state: 'rec' | 'warn' | 'blk';
  top: boolean; // inside the "Recomendados" band
  selected: boolean;
  why: string; // the reason under a map that is not recommended; '' for a recommended one
}
export interface SpecialView {
  id: string; // data-map
  to: string; // data-to: the page it opens ('' none)
  label: string;
  sub: string;
  selected: boolean;
}
export type MapItem =
  | { kind: 'band'; key: 'band'; label: string; cards: CardView[] }
  | { kind: 'card'; key: string; card: CardView }
  | { kind: 'special'; key: string; special: SpecialView }
  | { kind: 'fold'; key: 'fold'; label: string; sub: string }; // the "Otros mapas (N) ▸" button: never a selected card

export interface MapPanelInput {
  vs: boolean;
  n: number; // players the panel is for
  selected: string; // app.config.map
  page: MapGroupPage; // which page of the coop catalogue shows (always 'classic' in versus)
  top: readonly CardRow[]; // coop: the recommended band
  shown: readonly CardRow[]; // the cards of the page, the folded ones left out unless `unfolded`
  folded: readonly CardRow[]; // coop: maps that cannot be picked for this group
  unfolded: boolean;
}

const STATE = { recommended: 'rec', warn: 'warn', blocked: 'blk' } as const;

export function cardView({ map, status }: CardRow, selected: string, top = false): CardView {
  const f = mapFeatures(map.rows);
  return {
    id: map.id,
    name: map.name,
    range: `${map.nMin}-${map.nMax}`,
    stars: '★'.repeat(map.stars),
    cheese: f.cheese,
    sink: f.sink,
    state: STATE[status.state],
    top,
    selected: map.id === selected,
    why: status.state === 'recommended' ? '' : status.reason,
  };
}

const special = (id: string, label: string, sub: string, selected: string, to = ''): MapItem => ({
  kind: 'special',
  key: `s:${id}:${to}`, // 'group' repeats: the page it opens tells the cards apart
  special: { id, to, label, sub, selected: id === selected },
});

function specials(i: MapPanelInput): MapItem[] {
  const s = i.selected;
  if (i.vs) return [special(VERSUS_AUTO, 'Aleatorio', 'de los que caben', s), special(VERSUS_RANDOM, 'Mapa generado', 'semilla nueva', s)];
  if (i.page !== 'classic') return [special('group', '◂ Inicio', 'recomendados y clásicos', s, 'classic')];
  return [
    special('auto', 'Aleatorio', 'de los ideales', s),
    special('random', 'Mapa generado', 'semilla nueva', s),
    special('group', 'Carta larga ▸', 'platos nuevos', s, 'series'),
    special('group', 'Taller ▸', 'mecánicas nuevas', s, 'taller'),
    special('group', 'Sin dinámica ▸', 'los 6 simples', s, 'plain'),
  ];
}

/** The panel top to bottom: the band, the page's cards, the special cards and the fold. Each item has a key that is the same render after render. */
export function mapItems(i: MapPanelInput): MapItem[] {
  const band: MapItem[] = i.top.length
    ? [{ kind: 'band', key: 'band', label: `Recomendados para ${i.n}`, cards: i.top.map((r) => cardView(r, i.selected, true)) }]
    : [];
  const cards: MapItem[] = i.shown.map((r) => ({ kind: 'card', key: `c:${r.map.id}`, card: cardView(r, i.selected) }));
  const fold: MapItem[] = i.folded.length
    ? [
        {
          kind: 'fold',
          key: 'fold',
          label: i.unfolded ? '◂ Ocultar otros' : `Otros mapas (${i.folded.length}) ▸`,
          sub: `no sirven con ${i.n}`,
        },
      ]
    : [];
  return [...band, ...cards, ...specials(i), ...fold];
}
