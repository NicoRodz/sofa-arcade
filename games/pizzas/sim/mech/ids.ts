// The twelve map mechanics (design pizzas-mecanicas-mapas-diseno.md, section 1): ids, the flags `flags.mech.<id>` and the tile letters each one owns.
// A mechanic is off by default. A map declares `mechanics: [...]` and the lobby turns those flags on (mechFlagsOf); a round with none on never creates `game.mech`.
export const MECH_IDS = [
  'kneader',
  'woodOven',
  'gate',
  'oil',
  'sprinkler',
  'bridge',
  'oneWay',
  'raft',
  'beltReverse',
  'ovenHeat',
  'heavyTray',
  'mutation',
] as const;
export type MechId = (typeof MECH_IDS)[number];
/** What createGame accepts: any subset, missing = off. */
export type MechOpts = Partial<Record<MechId, boolean>>;
/** What the sim keeps (`game.flags.mech`): every id, true or false. */
export type MechFlags = Record<MechId, boolean>;

export const isMechId = (v: unknown): v is MechId => MECH_IDS.includes(v as MechId);

/** Which tanda implements each mechanic (for the stubs' documentation and the registry test). */
export const MECH_TANDA: Record<MechId, string> = {
  kneader: 'T1e',
  woodOven: 'T1e',
  gate: 'T1b',
  oil: 'T1d',
  sprinkler: 'T1d',
  bridge: 'T1c',
  oneWay: 'T1c',
  raft: 'T1c',
  beltReverse: 'T1b',
  ovenHeat: 'T1b',
  heavyTray: 'T2',
  mutation: 'T1a',
};

/** The tile letters that exist only behind a flag. The metadata-only mechanics (beltReverse, ovenHeat, heavyTray, mutation) own none. */
export const MECH_LETTER_IDS: Record<string, MechId> = {
  M: 'kneader',
  W: 'woodOven',
  Q: 'woodOven',
  Z: 'gate',
  D: 'gate',
  a: 'oil',
  g: 'oil',
  '*': 'sprinkler',
  b: 'bridge',
  '>': 'oneWay',
  '<': 'oneWay',
  '^': 'oneWay',
  v: 'oneWay',
  '=': 'raft',
};

/** The flags a round of this map runs with: every declared mechanic on, the rest off. undefined (no mechanics) means the round plays as it always did. */
export function mechFlagsOf(mechanics: readonly MechId[] | undefined): MechOpts | undefined {
  if (!mechanics?.length) return undefined;
  return Object.fromEntries(mechanics.map((id) => [id, true]));
}

export const emptyFlags = (): MechFlags => Object.fromEntries(MECH_IDS.map((id) => [id, false])) as MechFlags;
export const anyMech = (o: MechOpts | undefined): boolean => !!o && MECH_IDS.some((id) => o[id]);
