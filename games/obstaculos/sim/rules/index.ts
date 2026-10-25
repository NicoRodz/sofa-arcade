// Rules of plan §6 (stragglers, bubble, reunion) and §8 (lives, checkpoints, score, victory), plus the expedition (3 levels).
export { goalZone, levelScore, medalFor, stepCheckpoints, stepGoal, stepStars } from './goal';
export { dropCrumbs, killPlayer, sendToBubble, stepBubbles, stepDeaths, stepStragglers } from './lives';
export { medianPlayer, placeAtCell, progressField, progressOf, respawnCell, revive } from './placement';
export { type Awards, type RunState, advanceRun, awards, awardsOf, newRun } from './run';
