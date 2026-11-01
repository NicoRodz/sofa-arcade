// The shape of `game.mech`, held by the round state without importing the module contract (types.ts): a leaf with no imports.
/** `game.mech`: exists only when some flag is on. Slices follow the design (section 3 "Estado"); a module creates its own in `init`. */
export interface MechState {
  hash: number; // fingerprint of every active module's hashExtra, refreshed at the end of each tick
  kneader?: Record<number, { prog: number; hands: number[] }>; // station index -> progress (ticks) and the chefs on the handles
  wood?: Record<number, number>; // oven station index -> fuel (bellows, cap 900)
  gate?: { open: boolean; phase: number };
  heat?: Record<number, number>; // oven station index -> temp 0..1000
  tile?: Uint8Array; // 0 nothing, 1 oil, 2 fire, 3 water; index y * 16 + x
  tileT?: Uint16Array;
  bridge?: Record<number, { uses: number; brokenUntil: number }>;
  raft?: Record<number, { pos: number; dir: number; wait: number }>;
  belt?: { reversed: boolean; next: number };
  tray?: { carrier: number | null; helper: number | null };
  ext?: Record<string, unknown>; // anything else a module needs
}
