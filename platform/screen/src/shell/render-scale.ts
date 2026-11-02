// Render scale (F6, Manchazo): the logical canvas stays 1920x1080 for every game; a game that opts in (ScreenGame.renderScale = 2) is drawn on a
// 3840x2160 backbuffer so a 4K TV shows it sharp instead of a stretched 1080p image. Pure decisions here; game-host.ts applies them to Phaser.

export type RenderScale = 1 | 2;

/**
 * A display must have at least this many physical pixels across (screen.width x devicePixelRatio) before r = 2 is worth its cost.
 * The product is invariant to browser zoom. Examples: 4K TV over HDMI 3840x1 or 1920x2 = 3840 -> 2; MacBook Pro 16" at its default
 * 1728x2 = 3456 -> 2 (still sharper than a 1920 buffer); Retina 1440x2 = 2880, MacBook Pro 14" 1512x2 = 3024, 1440p 2560x1 -> 1.
 * Limit: it looks at the display, not the window, so a small window on a 4K display also gets r = 2 (`?render=1` forces 1).
 */
export const MIN_PHYSICAL_WIDTH = 3200;

/** `?render=1|2` forces the scale of the games that opt in (anything else: no override). Never set by the phones or the relay. */
export function renderOverride(search: string = typeof location === 'undefined' ? '' : location.search): RenderScale | null {
  const v = new URLSearchParams(search).get('render');
  return v === '1' ? 1 : v === '2' ? 2 : null;
}

export interface ScaleInput {
  want: RenderScale; // what the game asked for (its ScreenGame.renderScale, default 1)
  override: RenderScale | null; // ?render=
  screenWidth: number; // CSS px
  dpr: number;
}

/** The scale a game runs at. A game that did not opt in is always 1, whatever the URL or the display says: its pixels must not move. */
export function pickRenderScale({ want, override, screenWidth, dpr }: ScaleInput): RenderScale {
  if (want === 1) return 1;
  if (override) return override;
  return screenWidth * dpr >= MIN_PHYSICAL_WIDTH ? 2 : 1;
}

let current: RenderScale = 1;
/** The scale the canvas runs at right now. */
export const renderScale = (): RenderScale => current;
export const setCurrentRenderScale = (r: RenderScale) => {
  current = r;
};
