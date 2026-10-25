// One bus for the whole session: every round's game emits here, so the sound layer subscribes once.
import { Emitter, type GameEvents } from '@pichi/core/events';
import type { AllObstEvents } from '@pichi/game-obstaculos';

export const gameBus = new Emitter<GameEvents & AllObstEvents>();
