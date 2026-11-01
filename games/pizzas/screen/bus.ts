// The bus of a Pizzas session: every round emits here, so the sound layer subscribes once.
import { createBus } from '@pichi/screen-kit';
import type { GameEvents } from '../sim/round/events';

export const pizzasBus = createBus<GameEvents>();
