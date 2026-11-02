// The F0 prototype map: 27x15 playable tiles, hand made, mirrored left-right and top-bottom (so both teams meet the same furniture).
// '#' is furniture (solid), '.' is floor. Out of bounds is solid. Pure data: no module-level work beyond reading the rows.
export const MAP_W = 27;
export const MAP_H = 15;

export const MAP_ROWS: readonly string[] = [
  '...........................',
  '.##.....#.........#.....##.',
  '.#......#.###.###.#......#.',
  '.....##.............##.....',
  '..#...#..#...#...#..#...#..',
  '..#..........#..........#..',
  '.....###...........###.....',
  '......#...#.....#...#......',
  '.....###...........###.....',
  '..#..........#..........#..',
  '..#...#..#...#...#..#...#..',
  '.....##.............##.....',
  '.#......#.###.###.#......#.',
  '.##.....#.........#.....##.',
  '...........................',
];

/** Spawn tiles of the left team (team 0), in the order its members take them; team 1 takes them mirrored (x -> MAP_W - 1 - x). */
export const SPAWNS_LEFT: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 14],
  [0, 6],
  [0, 8],
  [0, 3],
  [0, 11],
  [1, 5],
  [1, 9],
];

/** The 10 checkpoints of the reference circuit (tile x, y), walked in order by the scripted bot. */
export const CIRCUIT: readonly (readonly [number, number])[] = [
  [4, 0],
  [8, 3],
  [12, 5],
  [13, 7],
  [18, 6],
  [22, 3],
  [26, 0],
  [26, 14],
  [13, 14],
  [0, 14],
];

export function isSolid(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return true;
  return MAP_ROWS[y]![x] === '#';
}

export function spawnTile(team: number, k: number): readonly [number, number] {
  const [x, y] = SPAWNS_LEFT[Math.min(k, SPAWNS_LEFT.length - 1)]!;
  return team === 0 ? [x, y] : [MAP_W - 1 - x, y];
}
