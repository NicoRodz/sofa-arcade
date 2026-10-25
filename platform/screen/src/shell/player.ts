// One phone as the screen keeps it: its public info, the latest input and the counters of the connection.
import type { PressTracker, PublicPlayer } from '@pichi/core';

export interface PlayerRec {
  info: PublicPlayer;
  ctl: { x: number; y: number; b: boolean }; // latest input: no queue
  ctlAt?: number; // performance.now() of the last input packet (absent until the first one)
  pendA: number; // A presses not yet consumed by a tick
  pendB: number; // same for B (a quick tap can start and end between two ticks: the dash needs it)
  tracker: PressTracker;
  rtt: number[];
  lag: number[];
  off: number | null; // phone clock -> server clock
  pkts: number;
  pktsRate: number;
}
