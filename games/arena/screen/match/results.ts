// Manchazo's results panel: who won, the area of each team and the small team's edge when there was one. Pure functions of the round's state (no DOM).
import { handicap, matchResult, type ManchazoState } from '../../sim';

export interface ResultsView {
  heading: string;
  color: string; // winner's colour ('' on a draw)
  rows: { icon: string; name: string; percent: string; tiles: number; color: string }[];
  note: string;
}

export function resultsView(s: ManchazoState, teams: readonly { name: string; icon: string; color: string }[]): ResultsView {
  const r = matchResult(s);
  const rows = r.order.map((t) => {
    const info = teams[t.team] ?? { name: `Equipo ${t.team + 1}`, icon: '■', color: '#888888' };
    return { icon: info.icon, name: info.name, percent: `${t.percent.toFixed(1)} %`, tiles: t.tiles, color: info.color };
  });
  const win = r.winner === null ? undefined : teams[r.winner];
  const sizes = s.match.sizes;
  const h = handicap(sizes);
  const small = sizes[0] === sizes[1] ? -1 : sizes.indexOf(Math.min(...sizes));
  return {
    heading: win ? `¡Ganó ${win.name}!` : 'Empate',
    color: win?.color ?? '',
    rows,
    note:
      small < 0
        ? ''
        : `${sizes[1 - small]} contra ${sizes[small]}: el equipo chico pintó con radio ${h.radius[small]} y tuvo ${h.reserve[small]} piñata(s) de reserva`,
  };
}

export function resultsHtml(v: ResultsView, esc: (s: string) => string): string {
  const rows = v.rows
    .map(
      (r, i) =>
        `<div class="arow" style="color:${esc(r.color)}"><b>${i + 1}</b> ${esc(r.icon)} ${esc(r.name)} · ${esc(r.percent)} del área · ${r.tiles} casillas</div>`,
    )
    .join('');
  return `${rows}${v.note ? `<div class="arow">${esc(v.note)}</div>` : ''}`;
}
