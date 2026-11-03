// The cards' names, and how long the icon over a player lasts. (The PR1 pills "AZUL 4 → CINTA" are gone: the top feed, top-feed.ts, says who took or used what and what it does.)
import { SABOTAGES, PLUS_SABOTAGES, type SabotageKind } from '../../../sim';

export const ICON_TICKS = 60; // the icon over the player lasts 1 s: long enough to see who to chase, short enough not to hide the neighbours

const NAMES = Object.fromEntries([...SABOTAGES, ...PLUS_SABOTAGES].map((k) => [k.kind, k.name])) as Record<SabotageKind, string>;
export const sabotageName = (kind: SabotageKind): string => NAMES[kind];
