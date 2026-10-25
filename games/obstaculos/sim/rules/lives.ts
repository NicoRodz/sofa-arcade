// Rules: death, lives, the hearts-out reset, stragglers, the rescue bubble and the crumb trail.
import { medianPlayer, progressOf, respawnCell, revive, steps } from './placement';
import { BUBBLE_POP_SEC, BUBBLE_SPEED_TILES, CRUMB_EVERY_SEC, CRUMB_MIN_AGE_SEC, DT, PLAYER_H, PLAYER_W, TILE } from '../../constants';
import { T, isHazardKind, isSolidKind } from '../../legend';
import { dropAll } from '../actions';
import { hazardKills } from '../entities';
import { emit, isActive, type PlayerState, type World } from '../state';
import { boxTouches, tileAt } from '../tiles';
import { AVALANCHE_START_TILES, CRUMB_KEEP, CRUSH_STEPS, RESPAWN_DELAY_SEC, VOID_MARGIN } from '../tuning';

// --- death and lives
export function killPlayer(w: World, p: PlayerState, cause: 'spikes' | 'liquid' | 'crush' | 'fall' | 'hazard'): void {
  dropAll(w, p);
  p.mode = 'dead';
  p.timer = steps(RESPAWN_DELAY_SEC);
  p.body.vx = 0;
  p.body.vy = 0;
  p.stats.deaths++;
  w.deaths++;
  p.deathGroup = w.tick;
  emit(w, 'obst.death', { player: p.slot, cause });
}
const spendLife = (w: World): void => {
  if (w.camp) {
    // campaign (plan §5.1): the hearts are shared; at 0 they refill and the team goes back, the level never "fails"
    w.heartsLost++;
    if (Number.isFinite(w.lives)) {
      w.lives = Math.max(0, w.lives - 1);
      if (w.lives === 0) heartsOut(w);
    }
    return;
  }
  if (Number.isFinite(w.lives)) {
    w.lives = Math.max(0, w.lives - 1);
    if (w.lives === 0 && w.status === 'playing') w.status = 'failed';
  }
};

// Campaign, 0 hearts: full hearts, everybody back at the checkpoint (Summit: at the start, checkpoints and hazard reset). The caller scores no third star (refills > 0).
function heartsOut(w: World): void {
  const c = w.camp!;
  w.refills++;
  w.lives = c.hearts;
  if (c.restartAtStart) {
    w.activeCheckpoint = -1;
    for (const k of w.ent.checkpoints) k.activated = false;
    const h = w.ent.hazard;
    if (h) {
      h.pos = h.kind === 'avalanche' ? -AVALANCHE_START_TILES * TILE : w.level.h * TILE;
      h.phase = 0;
      h.frozen = 0;
    }
  }
  emit(w, 'obst.heartsOut', { toStart: c.restartAtStart });
  for (const p of w.players)
    if (p.connected) {
      dropAll(w, p);
      revive(w, p, 'team');
    }
}

function hazardCause(w: World, p: PlayerState): 'spikes' | 'liquid' | 'crush' | 'fall' | 'hazard' | null {
  const b = p.body;
  if (b.y > w.level.h * TILE + VOID_MARGIN) return 'fall';
  if (p.invuln === 0) {
    const hz = hazardKills(w, p);
    if (hz) return hz;
    if (boxTouches(w.grid, b.x + 4, b.y + 4, PLAYER_W - 8, PLAYER_H - 8, (k) => k === T.Spikes)) return 'spikes';
    if (boxTouches(w.grid, b.x + 4, b.y + 4, PLAYER_W - 8, PLAYER_H - 8, (k) => k === T.Liquid)) return 'liquid';
  }
  p.crushed = boxTouches(w.grid, b.x, b.y, PLAYER_W, PLAYER_H, isSolidKind) ? p.crushed + 1 : 0;
  return p.crushed >= CRUSH_STEPS ? 'crush' : null;
}

// Deaths of this step cost one life together; a dead player waits RESPAWN_DELAY and returns at the checkpoint; if nobody is left active the team returns at once.
export function stepDeaths(w: World): void {
  let died = 0;
  for (const p of w.players) {
    if (!isActive(p)) continue;
    const c = hazardCause(w, p);
    if (c) {
      killPlayer(w, p, c);
      died++;
    }
  }
  if (died) spendLife(w);
  if (w.camp && w.players.some(isActive)) {
    // campaign: the fallen one comes back in a bubble beside the partner (if both fell, the team path below takes them to the checkpoint)
    for (const p of w.players) if (p.connected && p.mode === 'dead') sendToBubble(w, p, 'death');
  }
  for (const p of w.players) if (p.connected && p.mode === 'dead' && p.timer > 0) p.timer--;
  const anyActive = w.players.some(isActive);
  const anyPending = w.players.some((p) => p.connected && p.mode !== 'active');
  if (!anyActive && anyPending && w.players.some((p) => p.connected)) {
    for (const p of w.players)
      if (p.connected && p.mode !== 'active') {
        dropAll(w, p);
        revive(w, p, 'team');
      }
    return;
  }
  for (const p of w.players) if (p.connected && p.mode === 'dead' && p.timer === 0) revive(w, p, 'checkpoint');
}

// --- stragglers and bubbles
export function sendToBubble(w: World, p: PlayerState, reason: 'offscreen' | 'stray' | 'rope' | 'death'): void {
  dropAll(w, p);
  p.mode = 'bubble';
  p.bubble = { tx: p.body.x, ty: p.body.y, arrived: false };
  p.timer = 0;
  p.camp.mash = 0;
  p.camp.mashCool = 0;
  p.body.vx = 0;
  p.body.vy = 0;
  p.body.grounded = false;
  p.body.supportId = -1;
  emit(w, 'obst.bubble', { player: p.slot, reason });
  if (w.dparams.bubbleCostsLife) spendLife(w);
}

export function stepStragglers(w: World, offCamera: readonly boolean[] | undefined): void {
  const limit = steps(w.dparams.bubbleSec);
  for (const p of w.players) {
    if (!isActive(p)) {
      p.offCamera = 0;
      continue;
    }
    if (offCamera?.[p.slot]) {
      p.offCamera++;
      p.stats.offCameraSteps++;
    } else p.offCamera = 0;
  }
  // The reference is the median of those the camera shows (the majority): whoever is out of frame too long, behind or ahead of it, goes back in a bubble.
  const med = medianPlayer(
    w,
    w.players.filter((p) => isActive(p) && !offCamera?.[p.slot]),
  );
  if (!med) return;
  for (const p of w.players) {
    if (isActive(p) && p.slot !== med.slot && p.offCamera >= limit)
      sendToBubble(w, p, progressOf(w, p) < progressOf(w, med) ? 'stray' : 'offscreen');
  }
}

// A safe crumb every 0.25 s: on static ground, not crumbling or belt, no hazard within a tile.
export function dropCrumbs(w: World): void {
  for (const p of w.players) {
    if (!isActive(p)) continue;
    if (p.crumbCool > 0) {
      p.crumbCool--;
      continue;
    }
    const b = p.body;
    if (!b.grounded || b.supportId !== -1 || p.carriedBy >= 0 || p.lift || p.thrown) continue;
    const row = Math.round((b.y + PLAYER_H) / TILE),
      col = Math.floor((b.x + PLAYER_W / 2) / TILE);
    const under = tileAt(w.grid, col, row);
    if (under === T.Crumble || under === T.BeltL || under === T.BeltR) continue;
    if (boxTouches(w.grid, b.x - TILE, b.y - TILE, PLAYER_W + 2 * TILE, PLAYER_H + 2 * TILE, isHazardKind)) continue;
    p.crumbs.push({ x: b.x, y: b.y, tick: w.tick });
    if (p.crumbs.length > CRUMB_KEEP) p.crumbs.shift();
    p.crumbCool = steps(CRUMB_EVERY_SEC) - 1;
  }
}

function bubbleTarget(w: World, p: PlayerState): { x: number; y: number } {
  const med = medianPlayer(w);
  const src = med && med.slot !== p.slot ? med : null;
  if (!src) {
    const c = respawnCell(w);
    return { x: c.x * TILE + TILE / 2 - PLAYER_W / 2, y: (c.y + 1) * TILE - PLAYER_H };
  }
  const minAge = steps(CRUMB_MIN_AGE_SEC);
  for (let i = src.crumbs.length - 1; i >= 0; i--)
    if (w.tick - src.crumbs[i]!.tick >= minAge) return { x: src.crumbs[i]!.x, y: src.crumbs[i]!.y };
  return { x: src.body.x, y: src.body.y };
}

// Bubbles fly through everything at 9 tiles/s to the median's latest safe crumb, pop 0.4 s after arriving and leave 1 s of invulnerability.
export function stepBubbles(w: World): void {
  const base = BUBBLE_SPEED_TILES * TILE * DT;
  for (const p of w.players) {
    if (!p.connected || p.mode !== 'bubble' || !p.bubble) continue;
    const speed = w.camp ? base * (1 + w.camp.bubbleMashGain * p.camp.mash) : base; // bubble v2: mashing A speeds it up
    if (!p.bubble.arrived) {
      const t = bubbleTarget(w, p);
      p.bubble.tx = t.x;
      p.bubble.ty = t.y;
      const dx = t.x - p.body.x,
        dy = t.y - p.body.y,
        d = Math.hypot(dx, dy);
      if (d <= speed) {
        p.body.x = t.x;
        p.body.y = t.y;
        p.bubble.arrived = true;
        p.timer = 0;
      } else {
        p.body.x += (dx / d) * speed;
        p.body.y += (dy / d) * speed;
      }
    } else if (++p.timer >= steps(BUBBLE_POP_SEC)) revive(w, p, 'bubble', { x: p.bubble.tx, y: p.bubble.ty });
  }
}
