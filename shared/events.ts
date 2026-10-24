// Typed events emitted by the pure game logic. The sound layer (and anything else) subscribes to these;
// the logic knows nothing about who listens.
import type { Item, Recipe, StationKind } from './overcooked';
import type { TeamResult } from './teams';
import type { SabotageEvents } from './sabotage-config';

// `team` (optional, on the team-level events): the id of the team the event belongs to, for the HUD and the sounds. It is present
// only in versus (two or more teams); a cooperative round is one team and its events carry no team, exactly as before the teams refactor.

export interface GameEvents extends SabotageEvents {
  itemPicked: { player: number; item: Item; from: StationKind };
  itemDropped: { player: number; item: Item; at: StationKind };
  interactInvalid: { player: number };
  dash: { player: number; dx: number; dy: number }; // R2: unit direction
  bump: { player: number; other: number }; // R5: a dash hit another chef
  chopStart: { player: number; station: number }; // station = index in game.stations
  chopStop: { player: number; station: number };
  chopDone: { player: number; station: number };
  washStart: { player: number; station: number };
  washStop: { player: number; station: number };
  washDone: { player: number; station: number }; // one plate got clean
  dirtyNew: { station: number; team?: number }; // a dirty plate showed up at the return
  potStart: { station: number; team?: number };
  potReady: { station: number; team?: number };
  orderNew: { order: number; recipe: Recipe; team?: number; vip?: true };
  orderWarning: { order: number; team?: number };
  orderExpired: { order: number; team?: number };
  delivered: { player: number; points: number; tip: number; base: number; mult: number; team?: number; k?: number; vip?: true }; // coop: points = base + tip (the tip already times the streak multiplier). Versus: points = what the team scored, (base + tip) x2 if it won the VIP, times k
  dishRejected: { player: number; team?: number }; // R16: the wrong plate at the window
  streak: { n: number; mult: number; team?: number }; // R15: deliveries in a row (0 = lost) and the multiplier the next one gets
  countdownTick: { n: number; kind: 'start' | 'end' }; // start: 3, 2, 1, 0 = go; end: last seconds of the round
  roundStart: Record<string, never>;
  roundEnd: { score: number; delivered: number; winner?: number | null; results?: TeamResult[] }; // versus: score/delivered of the leader, winner (null: draw or no winner) and every team ranked
  // versus only (always carry the team)
  vipNew: { recipe: Recipe }; // the golden order appeared in every queue
  vipWon: { team: number; player: number; tie: boolean }; // first delivery of the VIP (tie: another team delivered it in the same tick, both win)
  vipLost: { team: number }; // the rival won: this team's VIP order is a normal order now
  comeback: { team: number }; // NOT from the sim: the host raises it when the team that was behind takes the lead (versusReport.nextLead; never while the scoreboard is hidden)
  pantryRefill: { stock: number }; // the shared pantry (V2) got a unit back (the takes are plain itemPicked)
  teamK: { team: number; k: number }; // the handicap multiplier of a team changed (a chef dropped for good)
  playerDropped: { player: number; team: number }; // the chef is a ghost for GHOST_MS; what it carried went to the nearest free counter
  playerBack: { player: number; team: number }; // it reconnected in time: same team, same chef
  playerGone: { player: number; team: number }; // the grace time ran out: the chef left the kitchen
  matchPaused: { teams: number[] }; // these teams are empty: the host picks 'continue' or 'end' (resolvePause)
  matchResumed: Record<string, never>;
}

export class Emitter<M extends object> {
  private handlers: { [K in keyof M]?: Set<(p: M[K]) => void> } = {};
  on<K extends keyof M>(type: K, fn: (p: M[K]) => void): () => void {
    (this.handlers[type] ??= new Set()).add(fn);
    return () => { this.handlers[type]?.delete(fn); };
  }
  emit<K extends keyof M>(type: K, payload: M[K]) {
    for (const fn of [...(this.handlers[type] ?? [])]) fn(payload);
  }
}
