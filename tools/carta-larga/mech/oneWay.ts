// STUB (T0). Bot job of 'oneWay', implemented by T1c: it never asks for the mechanic's job.
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const oneWayBot: MechBot = { wants: () => false };
