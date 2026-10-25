// Shape of window.__pg.snapshot() as the bots and the waits read it
export interface Snap {
  phase: string;
  fps: number;
  time: number;
  score: number;
  countdown: number;
  streak: number;
  bestStreak: number;
  crowd: string[];
  players: { id: number; x: number; y: number; item: string | null; cutting: boolean }[];
  stations: {
    kind: string;
    tx: number;
    ty: number;
    crate: number;
    item: string | null;
    progress: number;
    inputs: number[];
    done: boolean;
    count: number;
    clean: number;
  }[];
  orders: { recipe: string }[];
}
