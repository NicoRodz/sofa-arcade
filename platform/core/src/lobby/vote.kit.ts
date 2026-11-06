import { cast, makeRoster, openVote, snapshot, tick, type Roster, type VoteConfig, type VoteState } from './vote';

// Fake clock harness: `now` only moves when the test says so. Players 1..n sit, player 1 is the Captain.
export const core = (v: VoteState) => ({ votes: v.votes, closing: v.closing, status: v.status, result: v.result }); // an ignored action may only move the tick time

export class Rig {
  now = 0;
  roster: Roster;
  v: VoteState;
  rng: () => number = () => 0;
  constructor(n: number, cfg: Partial<VoteConfig> = {}) {
    this.roster = makeRoster(
      Array.from({ length: n }, (_x, i) => i + 1),
      0,
    );
    this.v = openVote({ voteId: 'v1', kind: 'pick', options: ['A', 'B', 'C'], windowMs: 15_000, ...cfg }, 0);
  }
  ctx() {
    return { now: this.now, rng: this.rng, roster: this.roster };
  }
  at(ms: number) {
    this.now = ms;
    this.v = tick(this.v, this.ctx());
    return this;
  }
  advance(ms: number) {
    return this.at(this.now + ms);
  }
  vote(p: number, o: string | null, id: string | number = 'v1') {
    this.v = cast(this.v, this.ctx(), p, id, o);
    return this;
  }
  roster2(f: (r: Roster) => Roster) {
    this.v = tick(this.v, this.ctx());
    this.roster = f(this.roster);
    this.v = tick(this.v, this.ctx());
    return this;
  }
  snap() {
    return snapshot(this.v, this.ctx());
  }
  get result() {
    return this.v.result;
  }
}
