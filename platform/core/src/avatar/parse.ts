// Wire parsers for the look. The slot is only known to the relay, so the parsers hand the RAW object on and the relay sanitizes it (sanitizeAppearance).
import { isPlainObject } from './appearance';

export type RawAppearance = Record<string, unknown>;
export const APPEARANCE_MAX_KEYS = 16;
/** `appearance` messages per second per player; the rest wait for the window's end and only the last one is applied. */
export const APPEARANCE_PER_SEC = 5;
/** Phases that accept an `appearance` ('menu' is the Pichiclub home). */
export const APPEARANCE_PHASES: readonly string[] = ['menu', 'lobby', 'results'];

/** A plain object with a sane number of keys, else undefined (a join with a bad `ap` is still a join: it just reads as "none"). */
export const parseRawAppearance = (v: unknown): RawAppearance | undefined =>
  isPlainObject(v) && Object.keys(v).length <= APPEARANCE_MAX_KEYS ? v : undefined;

/** `appearance{ap, done}` from a phone; null (dropped) when `ap` is not a plain object. `done` is true only when it is exactly true. */
export function parseAppearanceMsg(m: { ap?: unknown; done?: unknown }): { ap: RawAppearance; done: boolean } | null {
  const ap = parseRawAppearance(m.ap);
  return ap ? { ap, done: m.done === true } : null;
}
