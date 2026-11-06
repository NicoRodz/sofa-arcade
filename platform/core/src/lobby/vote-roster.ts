// Roster of the phone menus: who is connected, who is AFK, who may vote (E), the Captain. PURE and immutable. vote.ts re-exports the public part;
// `patch` is shared with recordParticipation, which stays in vote.ts because it reads a VoteState.
export type PlayerId = number;
export const AFK_IDLE_MS = 90_000;
export const AFK_MISSED_VOTES = 2;

export interface Presence {
  readonly connected: boolean;
  readonly afk: boolean;
  readonly lastInputAt: number;
  readonly missed: number;
}
export interface Roster {
  readonly players: Readonly<Record<PlayerId, Presence>>;
  readonly captainId: PlayerId | null;
}

const freshPresence = (now: number): Presence => ({ connected: true, afk: false, lastInputAt: now, missed: 0 });
export const patch = (r: Roster, id: PlayerId, p: Partial<Presence>): Roster => {
  const cur = r.players[id];
  return cur ? { ...r, players: { ...r.players, [id]: { ...cur, ...p } } } : r;
};

export function makeRoster(ids: readonly PlayerId[], now: number, captainId: PlayerId | null = ids[0] ?? null): Roster {
  return { players: Object.fromEntries(ids.map((id) => [id, freshPresence(now)])), captainId };
}
/** A player sitting down (also mid-vote: it counts in E at once). */
export const addPlayer = (r: Roster, id: PlayerId, now: number): Roster =>
  r.players[id] ? setConnected(r, id, true, now) : { ...r, players: { ...r.players, [id]: freshPresence(now) } };
export function removePlayer(r: Roster, id: PlayerId): Roster {
  const { [id]: _gone, ...rest } = r.players;
  return { players: rest, captainId: r.captainId === id ? null : r.captainId };
}
/** Disconnect leaves E at once; reconnecting is an input (reactivates). Their vote stays suspended in the vote state. */
export const setConnected = (r: Roster, id: PlayerId, connected: boolean, now: number): Roster =>
  connected ? patch(r, id, { connected: true, afk: false, lastInputAt: now }) : patch(r, id, { connected: false });
/** Any input from the phone: reactivates an AFK player. */
export function touch(r: Roster, id: PlayerId, now: number): Roster {
  const p = r.players[id];
  if (!p) return r;
  return patch(r, id, { lastInputAt: now, afk: false, missed: p.afk ? 0 : p.missed });
}
export function tickAfk(r: Roster, now: number): Roster {
  let out = r;
  for (const [k, p] of Object.entries(r.players))
    if (p.connected && !p.afk && now - p.lastInputAt >= AFK_IDLE_MS) out = patch(out, Number(k), { afk: true });
  return out;
}
export const setCaptain = (r: Roster, id: PlayerId | null): Roster => ({ ...r, captainId: id });
export const eligible = (r: Roster): PlayerId[] =>
  Object.keys(r.players)
    .map(Number)
    .filter((id) => {
      const p = r.players[id]!;
      return p.connected && !p.afk;
    })
    .sort((a, b) => a - b);
export const majorityOf = (e: number): number => Math.floor(e / 2) + 1;
