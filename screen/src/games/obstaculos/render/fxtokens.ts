// Re-exports from the pizza game's art tokens so the render folder has one import point for them.
export { C, FONT, CHEFS, hexNum } from '../../../art/tokens';
import { confettiColors } from '../../../art/fx';
export const confettiColorsOf = (): number[] => [...confettiColors];
