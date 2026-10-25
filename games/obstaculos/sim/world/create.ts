// Building a world and changing who is connected: createWorld, previewB, setConnected.
import { DIFFICULTY_PARAMS, ROPE_LEN } from '../../constants';
import type { Difficulty } from '@pichi/core/difficulty';
import { parseLevel } from '../../parse';
import type { GameMode, LevelDef } from '../../types';
import { dropAll, previewB as previewBPlayer, type BPreview } from '../actions';
import { createEntities } from '../entities';
import { buildRopes } from '../rope';
import { campaignParams, dparamsForCampaign, physicsOfWorld, type WorldId } from '../campaign';
import { placeAtCell, progressField, revive } from '../rules';
import { playerOf, type PlayerState, type World } from '../state';
import { newBody, physicsFor } from '../player';
import { buildGrid } from '../tiles';
import { SLOT_COUNT } from '../tuning';

export interface WorldOptions {
  level: LevelDef;
  mode?: GameMode; // lobby option; the level's tether can override it. Default 'chain'
  difficulty?: Difficulty; // default 'normal'
  slots: readonly number[]; // connected player slots (0..7)
  p90LatencyMs?: number; // adaptive coyote (plan §2)
  campaign?: { world: WorldId; n?: number }; // campaign layer for 2 (sim/campaign.ts): lives, forgiveness, hazards and rope come from the world; `difficulty` is ignored
}

function newPlayer(slot: number, connected = true): PlayerState {
  return {
    slot,
    connected,
    mode: 'active',
    body: newBody(slot, 0, 0),
    planted: false,
    plantAir: 0,
    holding: null,
    carriedBy: -1,
    thrown: 0,
    lift: null,
    climbing: false,
    ropeJump: true,
    invuln: 0,
    timer: 0,
    bubble: null,
    inGoal: false,
    offCamera: 0,
    crumbs: [],
    crumbCool: 0,
    crushed: 0,
    deathGroup: -1,
    stats: { deaths: 0, stars: 0, anchoredSteps: 0, throws: 0, catches: 0, offCameraSteps: 0 },
    camp: { assist: 0, assistDir: 0, jumpTick: -1000, mash: 0, mashCool: 0, signal: null, goHold: 0, pick: 0, onIce: false, geyserCool: 0 },
  };
}

export function createWorld(o: WorldOptions): World {
  const level = parseLevel(o.level);
  if (level.errors.length) throw new Error(`level ${o.level.id}: ${level.errors.join('; ')}`);
  const difficulty = o.difficulty ?? 'normal';
  const slots = [...new Set(o.slots)].filter((s) => s >= 0 && s < SLOT_COUNT).sort((a, b) => a - b);
  const camp = o.campaign ? campaignParams(o.campaign.n ?? slots.length, o.campaign.world) : null;
  const dparams = camp ? dparamsForCampaign(camp) : DIFFICULTY_PARAMS[difficulty];
  const tether = o.level.tether;
  const mode: GameMode = tether === 'freeOnly' ? 'free' : tether === 'chainOnly' ? 'chain' : (o.mode ?? 'chain');
  const grid = buildGrid(level, mode);
  const ent = createEntities(level, grid, dparams.hazardSpeed, camp);
  const w: World = {
    level,
    mode,
    difficulty,
    dparams,
    params: camp ? physicsOfWorld(camp, o.p90LatencyMs ?? 0) : physicsFor(difficulty, o.p90LatencyMs ?? 0),
    grid,
    tilesVersion: 0,
    tick: 0,
    status: 'playing',
    players: slots.map((s) => newPlayer(s)),
    ropes: [],
    ent,
    lives: dparams.lives,
    deaths: 0,
    progress: progressField(level),
    activeCheckpoint: -1,
    result: null,
    events: [],
    camp,
    heartsLost: 0,
    refills: 0,
    countdown: null,
    wind: camp && o.level.wind ? { phase: 'calm', dir: o.level.wind.dir } : null,
  };
  const spawn = level.markers.spawn[0]!;
  w.players.forEach((p, i) => placeAtCell(w, p, spawn, i, w.players.length));
  w.ropes = mode === 'chain' ? buildRopes(slots, o.level.cordadaMax, [], undefined, camp?.ropeLen ?? ROPE_LEN) : [];
  return w;
}

export const previewB = (w: World, slot: number): BPreview => {
  const p = playerOf(w, slot);
  return p ? previewBPlayer(w, p) : { action: 'none', target: null };
};

// Join or leave in the middle of a level. A leaver drops what it holds and its neighbours hook up (the rope eases to full length in 0.5 s);
// a joiner comes back at the checkpoint with the usual invulnerability.
export function setConnected(w: World, slot: number, connected: boolean): void {
  let p = playerOf(w, slot);
  if (!p) {
    if (!connected || slot < 0 || slot >= SLOT_COUNT) return;
    p = newPlayer(slot, false);
    w.players.push(p);
    w.players.sort((a, b) => a.slot - b.slot);
  }
  if (p.connected === connected) return;
  w.events = [];
  if (!connected) {
    dropAll(w, p);
    p.connected = false;
    p.inGoal = false;
  } else {
    p.connected = true;
    revive(w, p, 'checkpoint');
  }
  if (w.mode === 'chain') {
    const by = new Map(w.players.map((q) => [q.slot, q.body]));
    const dist = (a: number, b: number) => {
      const A = by.get(a)!,
        B = by.get(b)!;
      return Math.hypot(A.x - B.x, A.y - B.y);
    };
    w.ropes = buildRopes(
      w.players.filter((q) => q.connected).map((q) => q.slot),
      w.level.def.cordadaMax,
      w.ropes,
      dist,
      w.camp?.ropeLen ?? ROPE_LEN,
    );
  }
}
