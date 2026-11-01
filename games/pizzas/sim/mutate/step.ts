// The clock of the mutation: `wait` until MUTATE_AT_MS - MUTATE_WARN_MS (alarm + banner), then `warned` until MUTATE_AT_MS (the tiles change, one tick), then `done`.
// The mutation's own stream (seed XOR MUTATE_SEED_TAG) is touched only when something has to be relocated; no other stream is read here.
import { mulberry32, type Rng } from '@pichi/core';
import type { Game } from '../round/state';
import { applyMutation } from './apply';
import { MUTATE_AT_MS, MUTATE_SEED_TAG, MUTATE_WARN_MS, mutationFor, type Mutation } from './plan';

export interface Mutate {
  mutation: Mutation;
  phase: 'wait' | 'warned' | 'done';
  rng: Rng;
}

/** The round's mutation, or null (versus, or a map with none): the round then plays as it always did. */
export function createMutate(g: Pick<Game, 'versus' | 'mapId'>, seed: number): Mutate | null {
  const mutation = g.versus ? null : mutationFor(g.mapId);
  return mutation ? { mutation, phase: 'wait', rng: mulberry32((seed ^ MUTATE_SEED_TAG) >>> 0) } : null;
}

export function mutateTick(g: Game) {
  const m = g.mut!;
  if (m.phase === 'wait' && g.time >= MUTATE_AT_MS - MUTATE_WARN_MS) {
    m.phase = 'warned';
    g.bus.emit('mutate:warn', {
      id: m.mutation.id,
      title: m.mutation.title,
      blurb: m.mutation.blurb,
      inMs: Math.round(MUTATE_AT_MS - g.time),
    });
  }
  if (m.phase === 'warned' && g.time >= MUTATE_AT_MS) {
    m.phase = 'done';
    const moved = applyMutation(g, m.mutation, m.rng);
    g.bus.emit('mutate:apply', { id: m.mutation.id, tiles: m.mutation.tiles.map((t) => ({ x: t.x, y: t.y, to: t.to })), moved });
  }
}
