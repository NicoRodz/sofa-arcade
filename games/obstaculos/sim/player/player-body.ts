// The body of a player and the shapes of one physics step (Body, Platform, StepInput, PhysicsParams, StepCtx, StepEvents), plus newBody and the head
// platform. Data only; player.ts re-exports all of it and owns the stepping.
import type { Difficulty } from '@pichi/core';
import { DIFFICULTY_PARAMS, PLAYER_W, adaptiveCoyote } from '../../constants';
import type { TileGrid } from '../world/tiles';

export const NONE = 255; // "long ago" for the age counters
const HEAD_THICKNESS = 6;

export interface Body {
  id: number;
  x: number; // hitbox left, px
  y: number; // hitbox top, px
  vx: number;
  vy: number;
  grounded: boolean;
  supportId: number; // platform the body stands on (a head or a mover), -1 for tiles or none
  onOneWay: boolean; // the surface underfoot is one-way (a down + A drops through it)
  air: number; // steps since the body last ended a step on a surface; coyote lives here
  jumpAge: number; // steps since A was pressed; the buffer lives here
  dropFrames: number; // while > 0 one-way surfaces are ignored
  facing: 1 | -1;
  dx: number; // displacement of the last step: carries whoever stands on this body
  dy: number;
}

// A surface that is not a tile: a head, later a moving platform. dx/dy = how far it moved in the step before the snapshot.
export interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  oneWay: boolean;
  dx: number;
  dy: number;
}

export interface StepInput {
  move: number;
  down: boolean;
  jump: boolean;
} // move in [-1, 1], already quantized; jump = A pressed since the last step

export interface PhysicsParams {
  coyote: number;
  buffer: number;
  stickyEdges: boolean;
  iceFriction?: number;
} // iceFriction: campaign only (sim/campaign.ts physicsOfWorld); absent = ice tiles grip like ground
export const physicsFor = (d: Difficulty, p90LatencyMs = 0): PhysicsParams => ({
  coyote: adaptiveCoyote(d, p90LatencyMs),
  buffer: DIFFICULTY_PARAMS[d].bufferFrames,
  stickyEdges: DIFFICULTY_PARAMS[d].stickyEdges,
});

export interface StepCtx {
  grid: TileGrid;
  platforms: readonly Platform[];
  params: PhysicsParams;
}
export interface StepEvents {
  jump: '' | 'ground' | 'coyote' | 'trampoline';
  land: number; // fall speed in px/s when the body touched down this step, else 0
  landOn: 'ground' | 'oneWay' | 'head';
}

export function newBody(id: number, x: number, y: number): Body {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    grounded: false,
    supportId: -1,
    onOneWay: false,
    air: NONE,
    jumpAge: NONE,
    dropFrames: 0,
    facing: 1,
    dx: 0,
    dy: 0,
  };
}

export const headPlatform = (b: Body): Platform => ({
  id: b.id,
  x: b.x,
  y: b.y,
  w: PLAYER_W,
  h: HEAD_THICKNESS,
  oneWay: true,
  dx: b.dx,
  dy: b.dy,
});
