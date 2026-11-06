// Viewports, safe-area insets and touch selectors the phone layout harness measures (moved out of harness.ts).
import { ASSIST_TOUCH } from '../assist-scenarios';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface Viewport {
  name: string;
  w: number;
  h: number;
  insets: Insets[];
}
export const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH: Insets = { top: 0, right: 47, bottom: 21, left: 47 }; // iPhone with a notch, landscape
const ISLAND: Insets = { top: 0, right: 59, bottom: 21, left: 59 }; // iPhone with a Dynamic Island, landscape
const CUTOUT: Insets = { top: 0, right: 0, bottom: 0, left: 48 }; // Android camera cut-out on one side
// Realistic landscape CSS viewports: iPhone SE, 8, 12 mini, 12-14, Pixel, 14 Pro Max.
export const VIEWPORTS: Viewport[] = [
  { name: '568x320', w: 568, h: 320, insets: [NONE] },
  { name: '667x375', w: 667, h: 375, insets: [NONE] },
  { name: '812x375', w: 812, h: 375, insets: [NOTCH] },
  { name: '844x390', w: 844, h: 390, insets: [NONE, NOTCH] },
  { name: '844x340', w: 844, h: 340, insets: [NOTCH] }, // the same iPhone in Safari, with the browser bars showing
  { name: '915x412', w: 915, h: 412, insets: [NONE, CUTOUT] },
  { name: '932x430', w: 932, h: 430, insets: [NONE, ISLAND] },
];
// Portrait CSS viewports: iPhone SE 1 / SE 2-3 + 8 (no insets), iPhone 12-14 (notch), Pixel 7 (status bar 24, gesture bar), iPhone 14 Pro Max (Dynamic Island).
const P_NOTCH: Insets = { top: 47, right: 0, bottom: 34, left: 0 };
export const PORTRAITS: Viewport[] = [
  { name: '320x568', w: 320, h: 568, insets: [NONE] },
  { name: '375x667', w: 375, h: 667, insets: [NONE] },
  { name: '390x844', w: 390, h: 844, insets: [P_NOTCH] },
  { name: '412x915', w: 412, h: 915, insets: [{ top: 24, right: 0, bottom: 16, left: 0 }] },
  { name: '430x932', w: 430, h: 932, insets: [{ top: 59, right: 0, bottom: 34, left: 0 }] },
];
export const ORIENTATIONS = { landscape: VIEWPORTS, portrait: PORTRAITS } as const;
// What you press (the probe also records whether something else sits on top of its centre).
export const TOUCH_SELECTORS = [
  '#remote .rb',
  '#signals .sg',
  '#btnA',
  '#btnB',
  '#pswap',
  '#howtoopen',
  ...ASSIST_TOUCH,
  '#howtoclose',
  '#zoomfix',
  '#join button',
  '#name',
  '#teamswap',
  '#schoolskip',
  '#schoolall',
];
export const insetsName = (i: Insets) =>
  i.left || i.right || i.bottom || i.top ? `inset-${i.top}-${i.right}-${i.bottom}-${i.left}` : 'noinset';
