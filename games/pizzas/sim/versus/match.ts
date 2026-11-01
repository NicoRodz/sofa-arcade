// How a round ends and how a match survives chefs that drop: ranking, the roster, ghosts, the pause when a team empties.
import type { Game, TeamState } from '../round/state';
import { holdsPlace, rankTeams, type PauseChoice, type TeamResult } from '@pichi/core/lobby';
import { matchStatus } from '../rules/assist';
import { stopKind } from '../round/chop';
import { addPlayer } from '../round/create';
import { sabotageCancelAim } from '../rules/sabotage';

const resultOf = (t: TeamState): TeamResult => ({
  teamId: t.id,
  score: t.score,
  delivered: t.delivered,
  vip: t.vips,
  reachedAt: t.reachedAt,
});

// Ends the round: ranks the teams (score, deliveries, VIPs, who got there first; a draw has no winner). `aborted`: the host ended it from the pause.
export function finish(g: Game, aborted: boolean) {
  g.over = true;
  const { order, winner } = rankTeams(g.teams.map(resultOf));
  g.result = { order, winner: aborted || g.noWinner ? null : winner, aborted };
  if (!g.versus) {
    g.bus.emit('roundEnd', { score: g.score, delivered: g.delivered });
    return;
  }
  const lead = order[0]!;
  g.bus.emit('roundEnd', { score: lead.score, delivered: lead.delivered, winner: g.result.winner, results: order });
}

// --- Chefs that drop (versus; teams.ts has the policy) -------------------------------------------------------------------------
// Each tick before the clock moves: a chef whose grace time ran out leaves the kitchen, k follows the chefs that still hold a place,
// and a team with nobody stops the clock until the host picks. Returns false while the match is paused.
export function refreshRoster(g: Game): boolean {
  if (g.paused) return false;
  for (const e of g.roster) {
    if (e.droppedAt === null || holdsPlace(e, g.time) || !g.players.has(e.id)) continue;
    g.players.delete(e.id);
    for (const k of [...g.crowd.keys()]) if (k.split(':').includes(String(e.id))) g.crowd.delete(k);
    g.bus.emit('playerGone', { player: e.id, team: e.teamId });
  }
  const st = matchStatus(
    g.teams.map((t) => t.id),
    g.roster,
    g.time,
    g.handicap ? 'score-k' : 'none',
  );
  if (st.paused && !g.pauseDismissed) {
    g.paused = { teams: st.emptyTeams };
    g.bus.emit('matchPaused', { teams: st.emptyTeams });
    return false;
  }
  g.teams.forEach((t, i) => {
    if (st.k[i] === t.k) return;
    t.k = st.k[i]!;
    g.bus.emit('teamK', { team: t.id, k: t.k });
  });
  return true;
}

/**
 * The chef's phone dropped. It stays as a ghost (no body, no input, no interaction) for GHOST_MS of match time; what it held goes to the
 * nearest free counter of its kitchen (it keeps it when none is free). False when it was not playing or was already down.
 */
export function dropPlayer(g: Game, id: number): boolean {
  const p = g.players.get(id);
  const e = g.roster.find((r) => r.id === id);
  if (!p || !e || e.droppedAt !== null) return false;
  if (p.cutting) g.bus.emit(stopKind(g, p), { player: id, station: p.chopAt });
  e.droppedAt = g.time;
  if (p.assist) p.chopLatch = false;
  Object.assign(p, { ghost: true, cutting: false, chopAt: -1, vx: 0, vy: 0, kx: 0, ky: 0, dashMs: 0, buffA: 0, buffB: 0, crossing: false });
  if (p.dousing) p.dousing = false;
  if (p.slip) p.slip = null; // hazards only: the slide ends where it was
  if (g.sab) sabotageCancelAim(g, p); // the bag it had loaded goes back to its team's bin
  for (const k of [...g.crowd.keys()]) if (k.split(':').includes(String(id))) g.crowd.delete(k);
  if (p.item) {
    const free = g.stations.filter(
      (s) => s.kind === 'counter' && !s.item && s.fire === undefined && (s.owner === null || s.owner === p.team),
    );
    const near = free.sort((a, b) => Math.hypot(a.tx + 0.5 - p.x, a.ty + 0.5 - p.y) - Math.hypot(b.tx + 0.5 - p.x, b.ty + 0.5 - p.y))[0];
    if (near) {
      near.item = p.item;
      p.item = null;
    }
  }
  g.bus.emit('playerDropped', { player: id, team: p.team });
  return true;
}

/** The phone is back. True when the chef is still in the match (within GHOST_MS): same team, same chef. False: too late, it watches. */
export function rejoinPlayer(g: Game, id: number): boolean {
  const p = g.players.get(id);
  const e = g.roster.find((r) => r.id === id);
  if (!p || !e || e.droppedAt === null || !holdsPlace(e, g.time)) return false;
  e.droppedAt = null;
  p.ghost = false;
  g.bus.emit('playerBack', { player: id, team: p.team });
  return true;
}

/**
 * The phone came back after GHOST_MS (rejoinPlayer said no and refreshRoster already took the chef out): the chef sits down again in
 * its own team's kitchen, on its spawn tile, and k goes back with it. A pause that was waiting for this team ends by itself: the
 * ausente is here. False when the chef never was on a team of this match (a newcomer: it waits for the next round).
 */
export function reseatPlayer(g: Game, id: number, slot: number): boolean {
  const e = g.roster.find((r) => r.id === id);
  if (!g.versus || g.players.has(id) || !e || e.droppedAt === null || g.over) return false;
  const old = g.roster;
  g.roster = old.filter((r) => r.id !== id);
  if (!addPlayer(g, id, slot)) {
    g.roster = old;
    return false;
  }
  g.bus.emit('playerBack', { player: id, team: g.players.get(id)!.team });
  if (g.paused) {
    const st = matchStatus(
      g.teams.map((t) => t.id),
      g.roster,
      g.time,
      g.handicap ? 'score-k' : 'none',
    );
    if (!st.paused) {
      g.paused = null;
      g.bus.emit('matchResumed', {});
    }
  }
  return true;
}

/** The phone is back, whenever: within GHOST_MS the same chef wakes up, later the chef sits down again (what the screen calls). */
export const returnPlayer = (g: Game, id: number, slot: number): boolean => rejoinPlayer(g, id) || reseatPlayer(g, id, slot);

/** The host's answer to an empty team: carry on without a winner, or end the round now (also without one). */
export function resolvePause(g: Game, choice: PauseChoice) {
  if (!g.paused) return;
  g.paused = null;
  if (choice === 'end') {
    finish(g, true);
    return;
  }
  g.noWinner = true;
  g.pauseDismissed = true;
  g.bus.emit('matchResumed', {});
}
