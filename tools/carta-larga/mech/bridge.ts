// STUB (T0). Bot job of 'bridge', implemented by T1c: it never asks for the mechanic's job.
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const bridgeBot: MechBot = { wants: () => false };
