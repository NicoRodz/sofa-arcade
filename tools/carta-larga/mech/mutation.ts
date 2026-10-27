// STUB (T0). Bot job of 'mutation', implemented by T1a: it never asks for the mechanic's job.
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const mutationBot: MechBot = { wants: () => false };
