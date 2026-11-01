// The mutation clock held by the round (see step.ts): a leaf.
import type { Rng } from '@pichi/core';
import type { Mutation } from './plan';

export interface Mutate {
  mutation: Mutation;
  phase: 'wait' | 'warned' | 'done';
  rng: Rng;
}
