// Pure pose and anchor math of the chef rig, extracted from platform/screen/src/art/chef/rig.ts (F0). Same formulas,
// same constants: the Phaser rig and the future phone preview must agree. Units: design px, origin at the feet, y down.
export const HEAD_Y = -68;
export const MOUTH_DY = 15;

/** Bone anchors (parent-local). The head bones live under the head container, whose origin is the feet origin. */
export const ANCHORS = {
  foot: [-10, 10] as const, // x of the left/right shoe
  footY: -3,
  shoulder: [-25, 25] as const, // x of the left/right arm pivot
  shoulderY: -41,
  item: { x: 20, y: -44, sideX: 21, upX: 20, upY: -46, frontX: 0, frontY: -43 },
  eyeX: 7,
  eyeY: HEAD_Y - 2,
  mouthY: HEAD_Y + MOUTH_DY,
  dropX: 17,
  dropY: HEAD_Y - 6,
  tagY: 20,
} as const;

export type Face = 'down' | 'side' | 'up';
export type ChefAction = 'none' | 'chop' | 'stretch';

/** Facing from the aim vector. `flip` (+1/-1) mirrors the single side profile and keeps its last value when fx ~ 0. */
export function facing(fx: number, fy: number, prevFlip: number): { face: Face; flip: number } {
  const ax = Math.abs(fx),
    ay = Math.abs(fy);
  if (ay > ax * 1.3) return { face: fy < 0 ? 'up' : 'down', flip: prevFlip };
  return { face: 'side', flip: Math.abs(fx) > 0.05 ? (fx < 0 ? -1 : 1) : prevFlip };
}

/** Walk cycle: body bounce (px), lean (rad) and the opposite vertical offset of the two shoes. */
export function gait(phase: number, moving: boolean, skating: boolean, flip: number) {
  const bounce = moving && !skating ? Math.abs(Math.sin(phase)) * 4 : 0;
  const lean = skating ? 0.14 * flip : moving ? Math.sin(phase / 2) * 4 * (Math.PI / 180) : 0;
  const footDy = moving ? Math.sin(phase / 2) * 3 : 0;
  return { bounce, lean, footL: ANCHORS.footY + footDy, footR: ANCHORS.footY - footDy };
}

export interface ArmPoseIn {
  action: ChefAction;
  hitT: number; // ms inside the chop/stretch loop
  carrying: boolean;
  face: Face;
  moving: boolean;
  skating: boolean;
  phase: number;
}
export interface ArmPose {
  a: number; // left arm rotation (rad)
  b: number; // right arm rotation (rad)
  lenA: number; // vertical scale of each arm
  lenB: number;
}
export const CHOP_MS = 240;
export const STRETCH_MS = 360;

/** Arm angles and lengths for the current action; a rest pose swings with the walk and goes out on ice. */
export function armPose(i: ArmPoseIn): ArmPose {
  const rest = [0.14, -0.14] as const;
  if (i.action === 'chop') {
    const cyc = (i.hitT % CHOP_MS) / CHOP_MS;
    const down = cyc < 0.5 ? cyc * 2 : 1 - (cyc - 0.5) * 2; // 0 raised .. 1 down
    return i.carrying ? { a: -1.1, b: -2.3 + 1.9 * down, lenA: 0.7, lenB: 1 } : { a: rest[0], b: -2.3 + 1.9 * down, lenA: 1, lenB: 1 };
  }
  if (i.action === 'stretch') {
    const cyc = (i.hitT % STRETCH_MS) / STRETCH_MS;
    const push = 0.5 - 0.5 * Math.cos(cyc * Math.PI * 2);
    const len = 0.85 - 0.15 * push;
    return { a: -(0.45 + 0.75 * push), b: 0.45 + 0.75 * push, lenA: len, lenB: len };
  }
  const sw = i.skating ? 0.7 : i.moving ? Math.sin(i.phase / 2) * 0.3 : 0;
  const a = rest[0] + sw,
    b = rest[1] + (i.skating ? -sw : sw);
  if (!i.carrying) return { a, b, lenA: 1, lenB: 1 };
  return i.face === 'side' ? { a: -1.05, b: -1.3, lenA: 0.7, lenB: 0.55 } : { a: -1.2, b: 1.2, lenA: 0.62, lenB: 0.62 };
}

/** Eye/mouth offset toward the aim: `look` in x, `lookY` in y (only the front view looks down a little). */
export function eyeLook(face: Face, fx: number, fy: number, flip: number) {
  const len = Math.hypot(fx, fy) || 1;
  const look = face === 'side' ? 4 : face === 'down' ? Math.max(-4, Math.min(4, (fx / len) * 4)) * flip : 0;
  return { look, lookY: face === 'down' ? 1.5 : 0 };
}

/** Where the carried item sits for each view. */
export function itemAnchor(face: Face): { x: number; y: number } {
  const t = ANCHORS.item;
  return { x: face === 'side' ? t.sideX : face === 'up' ? t.upX : t.frontX, y: face === 'up' ? t.upY : t.frontY };
}
