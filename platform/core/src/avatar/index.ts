export * from './catalog';
export { defaultAppearance, sameAppearance, sanitizeAppearance, type Appearance } from './appearance';
export { randomAppearance } from './random';
export { CODE_LEN, decodeAppearance, encodeAppearance } from './codec';
export {
  APPEARANCE_MAX_KEYS,
  APPEARANCE_PER_SEC,
  APPEARANCE_PHASES,
  parseAppearanceMsg,
  parseRawAppearance,
  type RawAppearance,
} from './parse';
export type { PaintGradient, PaintStyle, Painter } from './painter';
export { Canvas2DPainter, type Canvas2DLike } from './canvas2d-painter';
export { PhaserGraphicsPainter, parseColor, type GraphicsLike } from './phaser-painter';
export * from './rig-math';
