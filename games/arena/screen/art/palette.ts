// Manchazo's colours: the "Sofa pop" tokens of the menu (cream, cocoa, ink) plus the two team colours and the furniture browns. Pure data.
import { C, hexNum } from '@pichi/screen-kit/art';

export const A = {
  ink: C.ink,
  cream: C.cream,
  cocoa: C.cocoa,
  tileA: '#F7F1E3',
  tileB: '#EFE6D2',
  grout: '#E0D5BE',
  wood: '#8C6A4F',
  woodDark: '#5E4532',
  woodLight: '#A98363',
  frame: '#6B4A36',
  frameLight: '#8A6347',
  orange: '#E69F00',
  orangeDark: '#A86F00',
  blue: '#0072B2',
  blueDark: '#00507D',
  gold: '#FFD23F',
  goldDark: '#C9A227',
  water: '#6EC6E8',
  waterDark: '#2A7FA8',
  steel: '#B8C4CC',
  steelDark: '#7D8B95',
  sofa: '#E0559B',
  sofaDark: '#A8336F',
  sofaLight: '#F58CC0',
  brush: '#F5C518',
  brushDark: '#B8860B',
  white: '#FFFFFF',
} as const;

/** The same colour as a Phaser number. */
export const num = (hex: string): number => hexNum(hex);

export const TEAM_HEX = [A.orange, A.blue] as const;
export const TEAM_DARK = [A.orangeDark, A.blueDark] as const;
