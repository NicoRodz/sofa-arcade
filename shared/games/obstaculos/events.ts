// Events of the game ("obst.*"). The world returns them on every step and the scene publishes them on the session bus
// (screen/src/bus.ts types it as Emitter<GameEvents & ObstEvents>); sound and juice subscribe there. Plan §14.
import type { SignalKind } from './sim/campaign';
export type DeathCause = 'spikes' | 'liquid' | 'crush' | 'fall' | 'hazard';
export type GrabTarget = 'ring' | 'player' | 'box' | 'lever';

export interface ObstEvents {
  'obst.jump': { player: number; kind: 'ground' | 'coyote' | 'rope' | 'trampoline' };
  'obst.land': { player: number; impact: number; on: 'ground' | 'oneWay' | 'head' }; // impact = fall speed in px/s
  'obst.ropeTaut': { rope: number; link: number; tension: number }; // tension = d / L
  'obst.ropeStrain': { rope: number; link: number; tension: number };
  'obst.grab': { player: number; target: GrabTarget; targetId: number };
  'obst.release': { player: number };
  'obst.throw': { player: number; target: number; vx: number; vy: number };
  'obst.handCatch': { player: number; target: number }; // player planted at the edge catches target
  'obst.death': { player: number; cause: DeathCause };
  'obst.bubble': { player: number; reason: 'offscreen' | 'stray' | 'rope' | 'death' }; // 'death': campaign, the fallen one flies to the partner
  'obst.respawn': { player: number; via: 'checkpoint' | 'bubble' | 'team' };
  'obst.checkpoint': { player: number; index: number };
  'obst.star': { player: number; index: number; streak: number };
  'obst.plate': { id: string; pressed: boolean; weight: number };
  'obst.gate': { id: string; open: boolean };
  'obst.goalEnter': { player: number; inside: number; total: number };
  'obst.levelClear': { level: string; timeSec: number; medal: 'gold' | 'silver' | 'bronze'; stars: number; deaths: number };
  'obst.runEnd': { score: number; levels: number; reason: 'complete' | 'failed' };
}

// Events of the campaign layer (sim/campaign.ts); never emitted by a quick-match world. Kept apart from ObstEvents on purpose: the screen's audio
// maps every ObstEvents key to a cue at compile time, and these have no sound yet (S3 wires them: signal, countdown, superJump, edgeAssist, heartsOut).
export interface CampaignEvents {
  'obst.signal': { player: number; kind: SignalKind }; // dynamic 1; also from the bubble
  'obst.countdown': { by: number; n: number }; // "go" held: 3, 2, 1, then 0 = "ya!"
  'obst.superJump': { players: number[] }; // dynamic 3: two ground jumps within the window
  'obst.edgeAssist': { player: number }; // a hanger whose head reached the ledge climbs on its own
  'obst.heartsOut': { toStart: boolean }; // 0 hearts: refilled and back at the checkpoint (Summit: at the start)
}
export type AllObstEvents = ObstEvents & CampaignEvents; // what the world returns on every step
export type ObstEventName = keyof AllObstEvents;
