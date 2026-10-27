// The Captain's rows for the generated coop map ("Mapa aleatorio"): the seed with its "Otra" button, the "Mecánicas" switch and one tick per mechanic.
// They exist only while the generated map is picked. Pure, like lobby-menu.ts (which appends them and routes their touches).
import type { LobbyConfig, MenuRow } from "@pichi/core";
import { GEN_MECHS } from "../sim/gen/place";
import { GEN_MECH_LABEL, mechsOf, pickedMechs } from "../sim/gen/lobby-opts";
import type { MechId } from "../sim/mech/ids";

export const SEED_ROW = "seed";
export const MECHS_ROW = "mechs";
export const MECH_ROW_PREFIX = "gm-";
export const mechRowId = (id: MechId) => `${MECH_ROW_PREFIX}${id}`;
export const mechIdOfRow = (row: string): MechId | undefined =>
  GEN_MECHS.find((m) => mechRowId(m) === row);

export function mechRows(c: LobbyConfig): MenuRow[] {
  if (c.modeId === "versus" || c.map !== "random") return [];
  const on = mechsOf(c.modeOptions);
  const picked = pickedMechs(c.modeOptions);
  const rows: MenuRow[] = [
    {
      id: SEED_ROW,
      label: `Semilla ${c.seed}`,
      kind: "buttons",
      value: null,
      options: [{ id: "again", label: "Otra", enabled: true }],
    },
    {
      id: MECHS_ROW,
      label: "Mecánicas",
      kind: "toggle",
      value: on,
      hint: on
        ? picked.length
          ? "Solo las marcadas"
          : "Ninguna marcada: el generador elige"
        : "Mapa clásico, sin mecánicas",
    },
  ];
  if (on)
    for (const m of GEN_MECHS)
      rows.push({
        id: mechRowId(m),
        label: GEN_MECH_LABEL[m] ?? m,
        kind: "toggle",
        value: picked.includes(m),
      });
  return rows;
}
