// Typed events emitted by the pure game logic. The sound layer (and anything else) subscribes to these;
// the logic knows nothing about who listens.
import type { Item, Recipe, StationKind } from './overcooked';

export interface GameEvents {
  itemPicked: { player: number; item: Item; from: StationKind };
  itemDropped: { player: number; item: Item; at: StationKind };
  interactInvalid: { player: number };
  chopStart: { player: number; station: number }; // station = index in game.stations
  chopStop: { player: number; station: number };
  chopDone: { player: number; station: number };
  washStart: { player: number; station: number };
  washStop: { player: number; station: number };
  washDone: { player: number; station: number }; // one plate got clean
  dirtyNew: { station: number }; // a dirty plate showed up at the return
  potStart: { station: number };
  potReady: { station: number };
  orderNew: { order: number; recipe: Recipe };
  orderWarning: { order: number };
  orderExpired: { order: number };
  delivered: { player: number; points: number; tip: number };
  countdownTick: { n: number; kind: 'start' | 'end' }; // start: 3, 2, 1, 0 = go; end: last seconds of the round
  roundStart: Record<string, never>;
  roundEnd: { score: number; delivered: number };
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
