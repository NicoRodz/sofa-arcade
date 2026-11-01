// The tuning table's shape (MagnetCfg): a leaf the round state holds without importing the magnet's code.

export type MagnetLevel = 'normal' | 'strong';
export interface MagnetCfg {
  level: MagnetLevel;
  reachMult: number; // interaction radius, times the plain one (BASE_REACH)
  assistExtra: number; // Ayudante: added to ASSIST_REACH_MULT
  coneDeg: number; // a station further than TOUCH must lie within this angle of where the chef heads
  facingBonus: number; // tiles: the station the chef heads for counts this much nearer (and the one behind it this much farther)
  pullDps: number; // the slow pull towards the target: degrees per second of facing
  pullGap: number; // ...only within this gap (tiles from the chef's body to the station's edge)
  pullSpeed: number; // ...and only below this speed (tiles/s)
  hugMax: number; // a dash that ends this far (tiles from the body) from a station in front of it goes on until it touches
  hugConeDeg: number;
  tauMs: number; // R1 inertia while the stick is held: the lower of this and the difficulty's (Easy and Hard are already instant)
  tauStopMs: number;
  dashCdMs: number; // the lower of this and the difficulty's
  bufferMs: number; // the higher of this and the difficulty's
}
