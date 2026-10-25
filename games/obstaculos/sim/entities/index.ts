// Dynamic entities of plan §9: plates, levers, gates, ladders, movers, balance, boxes, keys, crumbling tiles, belts, hazards.
// Everything mutates the World in place, in a fixed order, with no randomness: same inputs -> same hash.
export { stepActivation, stepTargets } from './activation';
export { stepBoxes } from './boxes';
export { boxPlatform, createEntities, extraPlatforms, objRect } from './create';
export { freezeHazard, hazardKills, stepHazard, stepKeys } from './keys-hazard';
export { computeLoads, requiredWeight } from './loads';
export { beltDx, crumbleAt, stepCrumbles, stepMovers } from './surfaces';
