// Per-biome palette (plan §13). Pure data. Ink is the same dark outline as the pizza game.
import type { Biome } from '@party/shared/obstaculos';

export const INK = '#2B1B17';
export interface Palette {
  skyTop: string;
  skyBottom: string;
  haze: string; // sky gradient and the colour far layers fade into
  far: string;
  mid: string;
  near: string; // parallax silhouettes
  top: string;
  topDark: string; // lip of the ground
  body: string;
  bodyDark: string;
  bodyLight: string;
  speck: string;
  accent: string; // veins, cracks, flowers
  wood: string;
  woodDark: string;
  liquid: string;
  liquidDark: string;
  foam: string;
  spike: string;
  spikeDark: string;
  glow: number; // tint of lamps and "light" in particles (0xRRGGBB)
}

export const PALETTES: Record<Biome, Palette> = {
  beach: {
    skyTop: '#7FD0F0',
    skyBottom: '#FDF1D4',
    haze: '#EAF6F4',
    far: '#8CC9D8',
    mid: '#E4C98A',
    near: '#CDAE6E',
    top: '#F8E2B0',
    topDark: '#E8C98A',
    body: '#F2D49B',
    bodyDark: '#D9B173',
    bodyLight: '#FFEBC2',
    speck: '#C79A5A',
    accent: '#F28F6B',
    wood: '#C98A4B',
    woodDark: '#8F5A2C',
    liquid: '#3BA7C9',
    liquidDark: '#2380A4',
    foam: '#E9FBFF',
    spike: '#F3EDE2',
    spikeDark: '#BDB2A0',
    glow: 0xfff2b0,
  },
  forest: {
    skyTop: '#9ED9C4',
    skyBottom: '#E9F5D6',
    haze: '#CFE8D0',
    far: '#7FB08C',
    mid: '#4C8052',
    near: '#2F5E3A',
    top: '#6FA445',
    topDark: '#4E7D3A',
    body: '#5B3A29',
    bodyDark: '#3F281C',
    bodyLight: '#75503A',
    speck: '#33200F',
    accent: '#F4A6C0',
    wood: '#9C6B3E',
    woodDark: '#6B4524',
    liquid: '#4B93A0',
    liquidDark: '#2F6B78',
    foam: '#DDF3EE',
    spike: '#8E9A7A',
    spikeDark: '#5E6A4E',
    glow: 0xd8ffb0,
  },
  mine: {
    skyTop: '#3B2D33',
    skyBottom: '#6A4B3C',
    haze: '#4A3A3A',
    far: '#4F3B3A',
    mid: '#3A2B2A',
    near: '#241A1A',
    top: '#C98A52',
    topDark: '#B87333',
    body: '#6B5148',
    bodyDark: '#4A3731',
    bodyLight: '#85685B',
    speck: '#2F221F',
    accent: '#E9A24E',
    wood: '#A06A35',
    woodDark: '#6B4220',
    liquid: '#4B7FA0',
    liquidDark: '#2E5A78',
    foam: '#D6EEF7',
    spike: '#AEB6BD',
    spikeDark: '#6F7A83',
    glow: 0xffd27a,
  },
  glacier: {
    skyTop: '#9FD8F2',
    skyBottom: '#F0FAFF',
    haze: '#DCF2FA',
    far: '#A9CDE0',
    mid: '#7F97AA',
    near: '#5E6B78',
    top: '#E6F7FD',
    topDark: '#BFE8F5',
    body: '#6F8191',
    bodyDark: '#5E6B78',
    bodyLight: '#8AA0B2',
    speck: '#44505B',
    accent: '#8EE0FF',
    wood: '#B58A5A',
    woodDark: '#7C5A36',
    liquid: '#2E86B5',
    liquidDark: '#1D5F88',
    foam: '#F4FDFF',
    spike: '#DDF4FF',
    spikeDark: '#8CB8CF',
    glow: 0xc8f0ff,
  },
  volcano: {
    skyTop: '#41262C',
    skyBottom: '#B5502F',
    haze: '#7C3A2E',
    far: '#5A2F2D',
    mid: '#3A2426',
    near: '#241A1C',
    top: '#4A4244',
    topDark: '#3A3234',
    body: '#2E2A2B',
    bodyDark: '#201C1D',
    bodyLight: '#443C3E',
    speck: '#161213',
    accent: '#FF5A1F',
    wood: '#6B4A38',
    woodDark: '#43291C',
    liquid: '#FF5A1F',
    liquidDark: '#C23A10',
    foam: '#FFD27A',
    spike: '#8A7F80',
    spikeDark: '#4E4647',
    glow: 0xff9a3c,
  },
};

// Rope colour per cordada; it blends to red with the tension. Chosen to stay away from the eight chef colours' red.
export const ROPE_COLORS = ['#FFB627', '#4FC3F7', '#8BD450', '#C48BFF'] as const;
export const ROPE_COLOR_DARK = ['#B8923B', '#3C94B8', '#74B046', '#9A6DD0'] as const;
export const ROPE_RED = '#E63B2E';
// Activator/objective pairs share a colour by letter (a/A = 0, b/B = 1...).
export const TAG_COLORS = ['#E63B2E', '#2F7DE1', '#3FA34D', '#FFC21A', '#8E5CD9', '#FF7A1A'] as const;
export const tagColor = (tag: string): string => TAG_COLORS[(tag.toLowerCase().charCodeAt(0) - 97 + 6) % 6] ?? '#B8C4CC';

export const hexToInt = (h: string): number => parseInt(h.replace('#', '').slice(0, 6), 16);
export function lerpColor(a: string, b: string, t: number): string {
  const x = hexToInt(a),
    y = hexToInt(b);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
