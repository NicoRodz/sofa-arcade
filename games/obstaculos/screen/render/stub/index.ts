// FakeWorld: a stand-in for F2a's world so the renderer can be exercised before the real one exists. TEST AND HARNESS ONLY: it uses the
// real F1 physics (stepPlayers) but fakes the rest (rope = naive position correction, lift/throw, bubbles, checkpoints, stars, goal).
// It implements WorldView (view.ts) and publishes obst.* events on a bus, exactly what the final adapter must do.
export { botController } from './bots';
export { cordadas, entitiesFromLevel } from './level';
export { type Controller, FakeWorld } from './world';
