// The bus of an Obstaculos session: every round emits here, so the sound layer subscribes once.
import { createBus } from '@pichi/screen-kit';
import type { AllObstEvents } from '../index';

export const obstBus = createBus<AllObstEvents>();
