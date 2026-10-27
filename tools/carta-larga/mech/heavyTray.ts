// STUB (T0). Bot job of 'heavyTray', implemented by T2: it never asks for the mechanic's job.
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const heavyTrayBot: MechBot = { wants: () => false };
