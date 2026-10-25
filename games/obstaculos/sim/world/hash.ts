import { hashRopes } from '../rope';
import type { World } from '../state';
import { hashBodies } from '../player';

// --- hash
export function hashState(w: World): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (Math.round(v * 1000) | 0), 0x01000193);
  };
  mix(w.tick);
  mix(w.status === 'playing' ? 0 : w.status === 'cleared' ? 1 : 2);
  mix(Number.isFinite(w.lives) ? w.lives : -1);
  mix(w.deaths);
  mix(w.activeCheckpoint);
  mix(w.tilesVersion);
  h = (h ^ hashBodies(w.players.map((p) => p.body))) >>> 0;
  h = Math.imul(h, 0x01000193);
  for (const p of w.players) {
    for (const v of [
      p.slot,
      p.connected ? 1 : 0,
      p.mode === 'active' ? 0 : p.mode === 'dead' ? 1 : 2,
      p.planted ? 1 : 0,
      p.holding ? { ring: 1, player: 2, box: 3, lever: 4 }[p.holding.kind] * 1000 + p.holding.id : 0,
      p.carriedBy,
      p.thrown,
      p.lift ? p.lift.t : -1,
      p.climbing ? 1 : 0,
      p.ropeJump ? 1 : 0,
      p.invuln,
      p.timer,
      p.inGoal ? 1 : 0,
      p.offCamera,
      p.crushed,
      p.stats.deaths,
      p.stats.stars,
      p.stats.anchoredSteps,
      p.stats.throws,
      p.stats.catches,
      p.bubble ? p.bubble.tx : 0,
      p.bubble ? p.bubble.ty : 0,
      p.bubble?.arrived ? 1 : 0,
      p.crumbs.length,
      p.crumbs.length ? p.crumbs[p.crumbs.length - 1]!.x : 0,
    ])
      mix(v);
  }
  hashRopes(w.ropes, mix);
  const e = w.ent;
  for (const a of e.activators) for (const v of [a.load, a.required, a.pressed ? 1 : 0, a.latched ? 1 : 0, a.holders.length]) mix(v);
  for (const o of e.objectives) for (const v of [o.open ? 1 : 0, o.ox, o.oy, o.phase, o.load]) mix(v);
  for (const b of e.boxes) for (const v of [b.x, b.y, b.vy, b.holders.length]) mix(v);
  for (const k of e.keys) for (const v of [k.x, k.y, k.heldBy, k.used ? 1 : 0]) mix(v);
  for (const c of e.crumbles) {
    mix(c.state);
    mix(c.t);
  }
  for (const s of e.stars) mix(s.taken ? 1 : 0);
  for (const c of e.checkpoints) mix(c.activated ? 1 : 0);
  if (e.hazard) {
    mix(e.hazard.pos);
    mix(e.hazard.frozen);
  }
  if (w.camp) {
    // the campaign layer's own state (a quick-match hash stays what it always was)
    mix(w.heartsLost);
    mix(w.refills);
    mix(w.countdown ? w.countdown.steps : -1);
    for (const p of w.players)
      for (const v of [
        p.camp.assist,
        p.camp.assistDir,
        p.camp.jumpTick,
        p.camp.mash,
        p.camp.mashCool,
        p.camp.goHold,
        p.camp.signal ? p.camp.signal.steps : -1,
        p.camp.pick,
        p.camp.onIce ? 1 : 0,
      ])
        mix(v);
    // A6 state is mixed only when it is not at rest: a world that never meets a lantern, an elastic ring or a geyser hashes exactly as it did in A5 (the Mundo 1 hashes are frozen)
    for (const p of w.players) if (p.camp.geyserCool) mix(p.camp.geyserCool);
    for (const a of e.activators) mix(a.timer);
    for (const en of e.enemies) for (const v of [en.x, en.y, en.dir, en.stun]) mix(v);
    for (const k of e.pickaxes) for (const v of [k.x, k.y, k.heldBy]) mix(v);
    for (const k of e.lanterns) for (const v of [k.x, k.y, k.heldBy]) mix(v);
    for (const r of w.ropes)
      for (const l of r.links)
        if (l.elastic || l.boing) {
          mix(l.elastic ? 1 : 0);
          mix(l.boing);
        }
    if (w.wind) mix(w.wind.phase === 'calm' ? 0 : w.wind.phase === 'warn' ? 1 : 2);
  }
  return h >>> 0;
}
