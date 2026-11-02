export const RIGHT = 0;
export const DOWN = 1;
export const LEFT = 2;
export const UP = 3;
export const NONE = -1;
export type Dir = typeof RIGHT | typeof DOWN | typeof LEFT | typeof UP | typeof NONE;

export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export const isHorizontal = (d: Dir): boolean => d === RIGHT || d === LEFT;
export const opposite = (d: Dir): Dir => (d === NONE ? NONE : (((d + 2) % 4) as Dir));
