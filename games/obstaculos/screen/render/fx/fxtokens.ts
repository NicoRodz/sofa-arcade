// Re-exports from the pizza game's art tokens so the render folder has one import point for them.
export { C, FONT, CHEFS, hexNum } from '@pichi/screen-kit/art';
import { confettiColors } from '@pichi/screen-kit/art/fx';
export const confettiColorsOf = (): number[] => [...confettiColors];
