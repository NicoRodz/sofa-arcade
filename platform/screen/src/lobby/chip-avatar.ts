// Lobby chip portraits drawn from the player's Appearance (creator F4). One bitmap per (look, slot colour), cached by the base36 code, so
// the 5/s live updates from a phone in the creator cost one draw per new look and the chips never redraw an unchanged one.
import { Canvas2DPainter, drawAvatar, encodeAppearance } from '@pichi/core/avatar';
import type { Appearance } from '@pichi/core/avatar';
import { domCanvas } from '../art/gfx';
import './chip-avatar.css';

const MAX_CACHED = 64;
const cache = new Map<string, HTMLCanvasElement>();

export const avatarKey = (ap: Appearance, slotColor: string) => `${encodeAppearance(ap)}|${slotColor}`;

function bitmap(ap: Appearance, slotColor: string): HTMLCanvasElement {
  const key = avatarKey(ap, slotColor);
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = domCanvas(120, 170, 60, 150, (c) => drawAvatar(new Canvas2DPainter(c), ap, { view: 'front', t: 0, slotColor }), 2);
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, cv);
  return cv;
}

/** A fresh canvas element (a DOM node lives in one place only) holding the cached bitmap of this look. */
export function avatarCanvas(ap: Appearance, slotColor: string): HTMLCanvasElement {
  const src = bitmap(ap, slotColor);
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  cv.getContext('2d')!.drawImage(src, 0, 0);
  return cv;
}

/** Restart a one-shot CSS animation class on an element. */
export function replay(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
