// The relay's two guards for the Captain's menu that are not about the message's shape (that is `parseClientMessage`): a rate limit per connection and the
// size of a raw frame. Pure, so the tests drive them with a fake clock.
import { MENU_ACT_MAX_BYTES, MENU_ACT_PER_SEC, MENU_MAX_BYTES } from '@pichi/core';

/** At most `max` calls per rolling `windowMs`; the excess is refused (the relay drops it, nobody is told). */
export function createRateLimiter(max = MENU_ACT_PER_SEC, windowMs = 1000, now: () => number = Date.now) {
  let stamps: number[] = [];
  return (): boolean => {
    const t = now();
    stamps = stamps.filter((s) => t - s < windowMs);
    if (stamps.length >= max) return false;
    stamps.push(t);
    return true;
  };
}

/** A `menuAct` frame over this size is dropped; a `menu` snapshot has its own, bigger one. */
export const actFits = (raw: string): boolean => Buffer.byteLength(raw) <= MENU_ACT_MAX_BYTES;
export const menuFits = (raw: string): boolean => Buffer.byteLength(raw) <= MENU_MAX_BYTES;
