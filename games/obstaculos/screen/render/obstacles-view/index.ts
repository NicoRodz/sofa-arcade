// One level on screen: background, tiles, rope, entities, explorers, fx, shared camera and HUD, drawn from a WorldView.
// The host calls update(dtMs) once per render frame after stepping the world and setting world.alpha. See render/README in view.ts.
export type { PlayerView, WorldView } from '../view';
export { buildObstacleTextures, ObstaclesView } from './view';
