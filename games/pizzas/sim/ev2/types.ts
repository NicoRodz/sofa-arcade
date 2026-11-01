// The state of the events with presence (see state.ts): a leaf with no imports.

export interface Spot {
  tx: number;
  ty: number;
  station: number; // index in game.stations of the counter it sits on
}
export interface Ev2 {
  board: Spot | null; // the light board of the blackout (set when the blackout starts)
  hold: number; // ms of B held at the board by enough chefs
  holders: number[]; // chefs holding it this tick (for the view)
  restoredAt: number | null; // match time a chef brought the light back (null: it came back by itself)
  rush: { total: number; ok: number; late: number; closed: boolean } | null;
  cake: { drawer: Spot; candled: boolean; by: number | null; order: number; closed: boolean } | null;
  spill: { tiles: number[]; dryTicks: number; ticks: number; closed: boolean } | null; // the patches the Derrame threw (tile indexes) and the ticks they have before they dry
}
