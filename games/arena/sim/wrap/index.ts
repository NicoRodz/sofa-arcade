export { BURST_RADIUS, SPONGE_BIG_AT, SPONGE_BIG_RADIUS, SPONGE_HOLD_TICKS, SPONGE_RADIUS, SPONGE_SOAK_TICKS, TAPE_AHEAD, TAPE_LEN, TAPE_LIFE_TICKS, TAPE_WINDUP_TICKS, WRAP_FX_TICKS } from './config';
export { WRAP_LOG_KINDS, createWrap, wrapWords, type Strip, type WrapEntry, type WrapLogKind, type WrapState } from './state';
export { cancelTape, lineTiles, startTape, tapeCut, underTape } from './tape';
export { burstSponge, squeezeSponge, startSponge } from './sponge';
export { stepWrap } from './step';
