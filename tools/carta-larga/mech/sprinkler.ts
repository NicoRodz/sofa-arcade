// STUB (T0). Bot job of 'sprinkler', implemented by T1d: it never asks for the mechanic's job.
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const sprinklerBot: MechBot = { wants: () => false };
