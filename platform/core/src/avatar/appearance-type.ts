/** What a player looks like: version plus eight small integers (see catalog.ts for the ranges). */
export interface Appearance {
  v: 1;
  g: number;
  s: number;
  hc: number;
  sk: number;
  hat: number;
  gl: number;
  bk: number;
  cl: number;
}
