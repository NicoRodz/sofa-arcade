// What the Pizzas lobby shows besides the map panel (the team column headings, the team bar, the pills of sabotage, events, muta and mode) as plain data. Pure
// functions of the lobby state, tested without a DOM; teams-view.ts draws them. The player cards are not here: their shells belong to the platform.

export interface TeamHeadView {
  icon: string;
  name: string;
  k: number; // the small-team multiplier; 0 when there is none to show
  count: string; // "4 jugadores"
}
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function teamHead(t: { icon: string; name: string; playerIds: readonly number[] }, k: number): TeamHeadView {
  return { icon: t.icon, name: t.name, k: k > 1 ? k : 0, count: plural(t.playerIds.length, 'jugador', 'jugadores') };
}

export interface HintInput {
  notice: string; // pz.teamNotice
  setup: { ok: true; k: readonly number[] } | { ok: false; problems: readonly string[] };
  sizes: readonly number[];
  handicap: boolean; // modeOptions.handicap !== false
}
export interface TeamHint {
  text: string;
  bad: boolean;
}
export function teamHint({ notice, setup, sizes, handicap }: HintInput): TeamHint {
  const big = Math.max(...sizes),
    small = Math.min(...sizes);
  const k = setup.ok ? Math.max(...setup.k) : 1;
  const text =
    notice ||
    (!setup.ok
      ? setup.problems[0]!
      : big !== small
        ? handicap
          ? `${big} contra ${small}: el equipo de ${small} gana ×${k}`
          : `${big} contra ${small}, sin ventaja para el equipo chico`
        : handicap && k > 1
          ? `Con Ayudante pesa 0,7: el equipo con más ayuda gana ×${k}`
          : 'Clic en un jugador: cambia de equipo');
  return { text, bad: !!notice || !setup.ok };
}

export interface TeambarView {
  locked: boolean;
  lockLabel: string;
  options: { id: string; label: string; on: boolean }[];
  hint: TeamHint;
}
export const OPTION_PILL: Record<string, string> = { hiddenScore: 'Marcador oculto', handicap: 'Ventaja equipo chico' }; // the registry labels are sentences; the pills need short ones

export function teambarView(
  locked: boolean,
  options: readonly { id: string; label: string }[],
  modeOptions: Readonly<Record<string, boolean | number | string>>,
  hint: TeamHint,
): TeambarView {
  return {
    locked,
    lockLabel: locked ? 'Desbloquear equipos' : 'Bloquear equipos',
    options: options.map((o) => ({ id: o.id, label: OPTION_PILL[o.id] ?? o.label, on: modeOptions[o.id] === true })),
    hint,
  };
}

/** A pill of a segmented choice (Apagado / Suave / Caos, Sí / No, Cooperativo / Versus). */
export interface PillView {
  id: string; // what the click handler reads (data-sab, data-ev, data-mut, data-mode)
  label: string;
  title: string;
  selected: boolean;
  disabled?: boolean; // the 'dis' look: the pill still answers a click, with the reason
}
export const yesNo = (on: boolean, title: (v: boolean) => string): PillView[] =>
  [true, false].map((v) => ({ id: String(v), label: v ? 'Sí' : 'No', title: title(v), selected: v === on }));
