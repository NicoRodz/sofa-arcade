// STUB (T0). Bot job of 'oil', implemented by T1d: it never asks for the mechanic's job.
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const oilBot: MechBot = { wants: () => false };
