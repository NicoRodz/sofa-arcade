// The words the campaign shows, built from the progress (pure, so the screen and the tests read the same text).
import { maxStarsOf, worldById, type Catalog, type CatalogLevel } from './progcatalog';
import { continueLevel, totalStars, worldStars, type Expedition } from './progress';

export const starsText = (n: number) => `${n}★`;
export const levelTag = (c: Catalog, l: CatalogLevel): string => `${worldById(c, l.world)?.name ?? ''} ${l.id}`.trim();

// The big button of the hub: "Continuar · Nico y Angi · Bosque 2-4 · 23★".
export function continueLabel(e: Expedition, c: Catalog): string {
  const at = continueLevel(e, c);
  return ['Continuar', e.name, at ? levelTag(c, at) : 'campaña completa', starsText(totalStars(e))].join(' · ');
}
export const starsOfWorld = (e: Expedition, c: Catalog, worldId: string): string =>
  `${worldStars(e, c, worldId)}/${maxStarsOf(c, worldId)}★`;
