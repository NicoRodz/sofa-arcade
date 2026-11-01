// A typed event bus for a game's screen layer: the sim emits, the sound and art layers subscribe. Each game owns one instance (its own event map).
import { Emitter } from '@pichi/core';

export type Bus<E extends object> = Emitter<E>;
export const createBus = <E extends object>(): Bus<E> => new Emitter<E>();
