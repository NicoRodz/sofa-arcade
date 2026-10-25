// Shape of window.__pg.obst() as the phones and the waits read it
export interface ObstState {
  phase: string;
  sess: string;
  level: string;
  levelIndex: number;
  tick: number;
  countdownMs: number;
  over: boolean;
  world: string;
  players: any[];
  goal: any;
  timeSec: number;
  lives: number;
  deaths: number;
}
