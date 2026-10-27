// The no-op hooks every stub spreads. A tanda replaces the ones it needs in its own `<id>/module.ts` and leaves the rest.
import type { MechModule } from './types';

export const noopHooks: Omit<MechModule, 'id' | 'tanda' | 'validate' | 'stamp'> = {
  onLoad: () => {},
  init: () => {},
  beforeMove: () => {},
  canEnter: () => true,
  friction: (_g, _tx, _ty, tauMs) => tauMs,
  claimsB: () => false,
  onInteract: () => false,
  tickStations: () => {},
  tickTiles: () => {},
  mutation: () => {},
  hashExtra: () => [],
  ovenRate: () => 1000,
  onFire: () => {},
};
