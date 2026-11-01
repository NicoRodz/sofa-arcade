// The pieces of a round a chef touches: stations, chefs, orders and the controls they play with. A leaf of the round state (state.ts re-exports them and adds the Game that holds them).
import type { TeamId } from '@pichi/core/lobby';
import type { StationKind } from '../maps';
import type { Recipe } from '../recipes/types';
import type { Slip } from '../sabotage-config';
import type { Item } from './item';

export interface Station {
  kind: StationKind;
  tx: number;
  ty: number;
  crate: number; // ingredient type, crates only
  item: Item | null; // boards and counters
  progress: number; // 0..1: board cutting or pot cooking
  inputs: number[]; // pot: ingredient types inside (0 dough, 1 tomato, 2 cheese)
  done: boolean; // pot: dish ready
  count: number; // plates: clean stock (finite-plate maps); dirty (return): dirty plates waiting; sink: dirty plates to wash
  clean: number; // sink: washed plates ready to take
  owner: TeamId | null; // the team whose kitchen it is: chefs of another team cannot use it. null: shared (nobody owns it)
  pantry?: true; // a crate of the shared pantry: it gives from the common stock (game.pantry) instead of for free
  // burn / fire only (absent otherwise: a round without them never sets these)
  readyAt?: number; // pot: match time the pizza got ready (it burns `burn.graceMs` later); shifted while the lights are out
  warned?: true; // pot: the warning beep sounded
  burnt?: true; // pot: the ready pizza burnt (smoke): it only serves for the bin
  wood?: true; // the W oven: a pot whose speed the woodOven module sets (mech/); absent on every other station
  fire?: number; // on fire: the ms of Picar already spent putting it out (present = burning, the station is out of use)
  fold?: number;
  stage?: 'base' | 'bell' | 'top'; // pot, a card with the Pizza blanca only: first bake of the bare dough, the bell (the toppings must go in now), the second bake
  bellLeft?: number; // ms of the bell's window left
  folded?: true; // a round with a Carta del día, pot only: 0..1 of Picar folding the dough and tomato; folded = a calzone (it bakes longer)
}
export interface Player {
  id: number;
  slot: number;
  spawn: number; // index into game.spawns where this chef started (puesto i belongs to spawn i)
  x: number;
  y: number;
  fx: number; // facing, last non-null stick vector
  fy: number;
  vx: number; // R1: smoothed velocity, tiles/s
  vy: number;
  item: Item | null;
  cutting: boolean;
  chopAt: number; // station index being chopped, -1 if none
  bHeld: boolean; // B as of the previous tick: a rising edge with empty hands and no station in front is a dash (R2)
  dashMs: number; // time left in the running dash
  dashCd: number; // time until the next dash
  dashDx: number; // dash direction (unit vector)
  dashDy: number;
  dashHit: number[]; // chefs this dash already pushed (R5): one push each
  kx: number; // R5: knock velocity from a dash that hit this chef, tiles/s, fades out
  ky: number;
  buffA: number; // R6: A presses waiting for a station to show up in front
  buffAge: number; // ms since the newest of them
  buffB: number; // R6: ms left of a dash press that found nothing to do yet
  crossing: boolean; // R4: in a pair that is crossing through each other (slower, drawn see-through)
  team: TeamId; // the team this chef plays for (0 in a cooperative round)
  ghost: boolean; // a dropped chef: no collision, no input, no interaction, until it reconnects (GHOST_MS) or is removed
  // Ayudante (assist.ts): absent for every other chef, so a round without it never touches these
  assist?: true; // this chef plays on Ayudante: reach x1.5 with auto-aim, no inertia, one-tap chopping, no slipping
  chopLatch?: boolean; // Ayudante: B was tapped at a cuttable board / a sink and the chop goes on without holding it
  // hazards only (absent otherwise: a round without hazards never creates them)
  slip?: Slip | null; // sliding on rubbish: no control until it ends
  immuneUntil?: number; // match time until which rubbish does not make this chef slip
  inTrash?: number[]; // rubbish items whose trigger disc the chef is inside of now: slipping counts entering, not standing there
  dousing?: boolean; // burn only: the chef's Picar is going into a fire (the extinguisher), not into a board or a sink
}
export interface Order {
  id: number;
  expiresAt: number;
  warned: boolean;
  recipe: Recipe;
  vip?: boolean;
  birthday?: boolean;
  red?: true; // eventsV2 (ev2/): a ticket of the Hora punta
  cake?: true; // eventsV2: the cake of the Cumpleaños (a birthday order with a candle step)
  parts?: Recipe[]; // a Bandeja familiar (recipes/bandeja.ts): its three plates...
  served?: boolean[]; // ...which of them are already on the window
  firstAt?: number; // match time the first one went in
} // birthday: the mid-round event's order, worth BIRTHDAY_POINTS flat
// a = new A presses since last tick; bTaps = new B presses since last tick (a quick tap can start and end between two ticks)
export interface Controls {
  x: number;
  y: number;
  a: number;
  b: boolean;
  bTaps?: number;
}
