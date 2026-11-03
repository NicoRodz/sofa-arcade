// Rescue and Loot (PR3, flag `rescue`). Written in 60 Hz ticks, as the plan gives them (M3).
export const RESCUE_TICKS = 12; // a teammate on your tile or an orthogonal neighbour this many ticks in a row frees you from the stain
export const RESCUE_GLOW_TICKS = 30; // the freed body and its rescuers glow this long (display only, but part of the state)
export const LOOT_TICKS = 240; // a dropped sabotage lies on the floor this long, then goes back to the spawner it came from
export const LOOT_LOCK_TICKS = 120; // the body that dropped it cannot pick it up for this long; any other body can
