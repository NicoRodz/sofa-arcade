import { describe, expect, it } from 'vitest';
import { coopLobbyView, recommendedForN } from '../../sim/maps';
import { VERSUS_AUTO, VERSUS_RANDOM, teamSizes, versusLobbyMaps } from '../../sim/versus/lobby';
import { type MapItem, type MapPanelInput, mapItems } from './maps-model';

const coop = (n: number, selected: string, showOthers = false, page: 'classic' | 'series' = 'classic'): MapPanelInput => {
  const rec = recommendedForN(n, 'normal', { played: new Set(), last: undefined });
  const v = coopLobbyView(n, page, rec, selected, showOthers);
  return { vs: false, n, selected, page, top: v.top, shown: v.shown, folded: v.folded, unfolded: v.unfolded };
};
const cards = (items: MapItem[]) => items.flatMap((i) => (i.kind === 'band' ? i.cards : i.kind === 'card' ? [i.card] : []));

describe('Pizzas lobby map panel model', () => {
  it('coop: the band comes first, then the page, the special cards and the fold; every key is unique and stable', () => {
    const items = mapItems(coop(8, '11'));
    expect(items[0]).toMatchObject({ kind: 'band', label: 'Recomendados para 8' });
    expect(items.map((i) => i.kind)).toEqual(
      [...items.map((i) => i.kind)].sort(
        (a, b) => ['band', 'card', 'special', 'fold'].indexOf(a) - ['band', 'card', 'special', 'fold'].indexOf(b),
      ),
    );
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(mapItems(coop(8, '11')).map((i) => i.key)).toEqual(keys); // the same inputs, the same keys: the nodes are reused
    expect(keys).toContain('s:group:series'); // 'group' repeats: the page it opens is part of the key
  });
  it('exactly one card is selected and a recommended map is drawn once (in the band, not again in the list)', () => {
    const items = mapItems(coop(8, '11'));
    const all = cards(items);
    expect(all.filter((c) => c.selected).map((c) => c.id)).toEqual(['11']);
    expect(all.filter((c) => c.id === '11')).toHaveLength(1);
    expect(all.filter((c) => c.top).length).toBeGreaterThan(0);
    expect(all.find((c) => c.top)).toMatchObject({ state: 'rec', why: '' });
  });
  it('"Otros mapas": folded with the count, "Ocultar otros" once unfolded; the blocked maps only show unfolded', () => {
    const folded = mapItems(coop(8, '11', false));
    const open = mapItems(coop(8, '11', true));
    const fold = (it: MapItem[]) => it.find((i) => i.kind === 'fold') as Extract<MapItem, { kind: 'fold' }>;
    expect(fold(folded).label).toMatch(/^Otros mapas \(\d+\) ▸$/);
    expect(fold(open).label).toBe('◂ Ocultar otros');
    expect(fold(open).sub).toBe('no sirven con 8');
    expect(cards(open).length).toBeGreaterThan(cards(folded).length);
    expect(cards(folded).some((c) => c.state === 'blk')).toBe(false);
    const blocked = cards(open).filter((c) => c.state === 'blk');
    expect(blocked.length).toBe(Number(fold(folded).label.match(/\((\d+)\)/)![1]));
    expect(blocked.every((c) => c.why !== '')).toBe(true);
  });
  it('a selected map inside the fold keeps it open (it never hides)', () => {
    const blocked = cards(mapItems(coop(8, '11', true))).find((c) => c.state === 'blk')!;
    const items = mapItems(coop(8, blocked.id, false));
    expect(items.find((i) => i.kind === 'fold')).toMatchObject({ label: '◂ Ocultar otros' });
    expect(cards(items).find((c) => c.selected)?.id).toBe(blocked.id);
  });
  it('a card of the folded maps and the special cards carry their own selection', () => {
    const items = mapItems(coop(8, 'auto'));
    expect(cards(items).some((c) => c.selected)).toBe(false);
    expect(items.filter((i) => i.kind === 'special' && i.special.selected).map((i) => i.key)).toEqual(['s:auto:']);
  });
  it('another page of the catalogue: no band, only the way back as a special card, a fold only when it has blocked maps', () => {
    const input = coop(6, '20', false, 'series');
    const items = mapItems(input);
    expect(items.some((i) => i.kind === 'band')).toBe(false);
    expect(items.some((i) => i.kind === 'fold')).toBe(input.folded.length > 0);
    expect(items.filter((i) => i.kind === 'special').map((i) => i.key)).toEqual(['s:group:classic']);
  });
  it('versus: the maps that fit, then Aleatorio and Mapa generado; no band, no fold', () => {
    const sizes = teamSizes([{ playerIds: [1, 2, 3, 4] }, { playerIds: [5, 6, 7, 8] }] as never);
    const items = mapItems({
      vs: true,
      n: 8,
      selected: VERSUS_AUTO,
      page: 'classic',
      top: [],
      shown: versusLobbyMaps(sizes),
      folded: [],
      unfolded: false,
    });
    expect(items.some((i) => i.kind === 'band' || i.kind === 'fold')).toBe(false);
    const sp = items.filter((i) => i.kind === 'special');
    expect(sp.map((i) => i.kind === 'special' && i.special.id)).toEqual([VERSUS_AUTO, VERSUS_RANDOM]);
    expect(sp[0]).toMatchObject({ special: { selected: true } });
    expect(cards(items).length).toBeGreaterThan(0);
  });
});
