// What the school remembers, and when it is offered. Two memories: the SCREEN's per room (sessionStorage: this session on this TV, so the second match of the
// night never repeats it) and each PHONE's per token (localStorage: the same person on the same phone skips it on another night, in another room).
// Storage can be blocked or absent: every read and write is guarded and the school simply is offered again.
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
}
const DONE = '1';
export const roomKey = (room: string) => `pg.school.room.${room}`;
export const phoneKey = (token: string) => `pg.school.${token}`;

export function readDone(kv: KV | null | undefined, key: string): boolean {
  try {
    return kv?.get(key) === DONE;
  } catch {
    return false;
  }
}
export function markDone(kv: KV | null | undefined, key: string): void {
  try {
    kv?.set(key, DONE);
  } catch {
    /* storage blocked: nothing to remember with */
  }
}
/** A KV over a Web Storage object (or null when there is none). */
export const kvOf = (s: Pick<Storage, 'getItem' | 'setItem'> | null | undefined): KV | null =>
  s ? { get: (k) => s.getItem(k), set: (k, v) => s.setItem(k, v) } : null;

/**
 * Is the school offered when the host presses "A cocinar"? Only for the pizza game, only once per room and session (done or skipped both count), and not when every
 * connected phone already did it. Nobody connected: nothing to teach (the lobby does not start without a player anyway).
 */
export function shouldOffer(o: { pizzas: boolean; sessionDone: boolean; connected: readonly { school?: boolean }[] }): boolean {
  return o.pizzas && !o.sessionDone && o.connected.length > 0 && !o.connected.every((p) => p.school === true);
}
