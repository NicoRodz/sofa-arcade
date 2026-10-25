// Constants and state of the surfaces (ice, floor belts). Units: tiles, seconds, milliseconds. Everything here runs only with `game.surf` set.
export const ICE_TAU_MS = 400; // velocity time constant on ice, moving or not: 4x the lag of a phone, so the slide hides it
export const BELT_SPEED = 1.2; // tiles/s a belt carries a chef or a loose item (a chef walks at 4.5: against the belt it still makes 3.3)
export const BELT_STEP_MS = 1000 / BELT_SPEED; // a loose item takes this long to cross one belt tile
export const SLIDE_SPEED = 1.5; // tiles/s a chef must carry when it steps onto ice for the slide sound

export interface SurfaceState {
  prog: Map<number, number>; // loose item id -> ms spent on its current belt tile
  last: Map<number, 'ice' | 'belt' | null>; // chef id -> the surface it stood on last tick (events fire on entering one)
}
export const newSurfaceState = (): SurfaceState => ({ prog: new Map(), last: new Map() });
