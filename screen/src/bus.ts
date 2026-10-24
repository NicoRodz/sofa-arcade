// One bus for the whole session: every round's game emits here, so the sound layer subscribes once.
import { Emitter, type GameEvents } from '@party/shared/events';

export const gameBus = new Emitter<GameEvents>();
