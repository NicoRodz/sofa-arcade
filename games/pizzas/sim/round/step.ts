// One tick of the round. The order of the calls and of the RNG draws is pinned by the golden rounds: do not reorder.
import { TICK_MS, type Controls, type Game } from './state';
import { finish, refreshRoster } from '../versus/match';
import { stepChef } from './chef';
import { idleControls, separate } from './movement';
import { hazardsTick } from './hazards';
import { sabotageTick } from '../sabotage';
import { MID_FX, ordersTick, settleVip, spawnVip } from './orders';
import { cookTick, refillPantry, returnDirtyPlates } from './stations';
import { burnTick } from '../burn';
import { midTick } from '../midround';

function countdown(g: Game, dtMs: number) {
  const prev = Math.ceil(g.countdown / 1000);
  if (!g.counting) {
    g.counting = true;
    g.bus.emit('countdownTick', { n: prev, kind: 'start' });
  }
  g.countdown = Math.max(0, g.countdown - dtMs);
  const now = Math.ceil(g.countdown / 1000);
  if (now !== prev) g.bus.emit('countdownTick', { n: now, kind: 'start' });
}

export function tick(g: Game, controls: Map<number, Controls>, dtMs = TICK_MS) {
  if (g.over) return;
  if (g.countdown > 0) {
    countdown(g, dtMs);
    return;
  }
  if (!g.started) {
    g.started = true;
    g.bus.emit('roundStart', {});
  }
  if (g.versus && !refreshRoster(g)) return; // an empty team stopped the clock
  const dt = dtMs / 1000;
  g.time += dtMs;

  for (const p of g.players.values()) {
    if (p.ghost) continue;
    stepChef(g, p, controls.get(p.id) ?? idleControls, dt, dtMs);
  }

  separate(g, controls, dtMs);
  if (g.hazards) hazardsTick(g);
  if (g.sab) sabotageTick(g);
  settleVip(g);

  cookTick(g, dtMs);
  if (g.burn) burnTick(g, dtMs);
  if (g.mid) midTick(g, dtMs, MID_FX);

  returnDirtyPlates(g);
  refillPantry(g);

  if (g.versus && g.time >= g.vip.nextAt) spawnVip(g);
  ordersTick(g);

  const left = Math.ceil((g.params.roundMs - g.time) / 1000);
  if (left <= 10 && left > 0 && left < g.endTick) {
    g.endTick = left;
    g.bus.emit('countdownTick', { n: left, kind: 'end' });
  }
  if (g.time >= g.params.roundMs) finish(g, false);
}
