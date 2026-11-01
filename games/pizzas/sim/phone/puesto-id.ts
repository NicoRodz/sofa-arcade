// The ids of the suggested stations: a leaf, so the map types can name a PuestoId without importing the puesto table (which reads the maps).
export const PUESTO_IDS = ['masa', 'corte', 'queso', 'horno', 'reparto', 'lavado', 'apoyo', 'prep', 'platos', 'entrega'] as const;
export type PuestoId = (typeof PUESTO_IDS)[number];
export const isPuestoId = (v: unknown): v is PuestoId => PUESTO_IDS.includes(v as PuestoId);
