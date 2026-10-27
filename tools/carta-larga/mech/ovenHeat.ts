// STUB (T0). Bot job of 'ovenHeat', implemented by T1b: it never asks for the mechanic's job.
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const ovenHeatBot: MechBot = { wants: () => false };
