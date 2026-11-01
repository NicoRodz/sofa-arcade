// The world of "Obstaculos en cadena": one fixed 60 Hz step over players, rope, grabs, entities and rules. Pure and deterministic
// (no Math.random, no Date): the same inputs give the same hashState().
//
// Public surface for the scene (F2c), the bots and the validator:
//   createWorld(opts)            -> World
//   step(world, inputs, opts?)   -> ObstEvent[]   inputs[slot] = PlayerStep (use InputTracker.step); opts.offCamera[slot] from the camera
//   snapshot(world)              -> WorldSnap     plain data for rendering; `grid` is the live tile grid, read only
//   hashState(world)             -> number
//   setConnected(world, slot, connected)          join / leave in the middle of a level
//   previewB(world, player)      -> BPreview      what B would do now (icon above the head)
export { TILE } from '../../constants';
export type { BPreview } from '../player/actions';
export type { ObstEvent, World, PlayerState, WorldStatus, LevelResult } from './state';
export { createWorld, previewB, setConnected } from './create';
export type { WorldOptions } from './create';
export { hashState } from './hash';
export type { PlayerSnap, WorldSnap } from './snapshot';
export { snapshot } from './snapshot';
export type { StepOptions } from './step';
export { step } from './step';
