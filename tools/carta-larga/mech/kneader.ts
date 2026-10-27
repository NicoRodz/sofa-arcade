// Bot job of 'kneader': the bot has to play it while a ball is on M and fewer than two chefs hold the handles (the job a free chef takes; the pairing itself is
// games/pizzas/test/mech/kneader/bot.ts, which plays the test map).
import { kneading } from '@pichi/game-pizzas/sim/mech/kneader/state';
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const kneaderBot: MechBot = {
  wants: (g) =>
    g.mech?.kneader
      ? Object.entries(g.mech.kneader).some(([i, st]) => kneading(g.stations[Number(i)]!) && st.hands.filter((id) => id > 0).length < 2)
      : false,
};
