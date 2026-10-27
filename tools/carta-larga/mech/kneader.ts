// STUB (T0). Bot job of 'kneader', implemented by T1e: it never asks for the mechanic's job.
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const kneaderBot: MechBot = { wants: () => false };
