// Versus: the team of this phone (the relay sends `you` after every config), shown as a strip with its colour, name, icon and kitchen side,
// and a button in the lobby to change team. Coop has no teams: nothing shows.
import type { TeamInfo } from '@pichi/core';
import { send, type Session } from './store';

export interface YouMsg {
  teamId: number;
  color: string;
  icon: string;
  sideLabel?: string;
}
export interface TeamsUi {
  show(you: YouMsg | null): void;
  apply(t: TeamInfo[] | null, locked: boolean): void;
}

export function createTeams(s: Session): TeamsUi {
  const { $ } = s;
  const show = (you: YouMsg | null) => {
    s.myTeam = you?.teamId ?? null;
    s.root.dataset.team = you ? 'on' : 'off';
    if (!you) return;
    const name = s.teams?.find((t) => t.id === you.teamId)?.name ?? `Equipo ${you.teamId + 1}`;
    document.documentElement.style.setProperty('--tc', you.color);
    for (const k of ['', '2']) {
      $(`tcicon${k}`).textContent = you.icon;
      $(`tcname${k}`).textContent = name;
      $(`tcside${k}`).textContent = you.sideLabel ? `· cocina ${you.sideLabel}` : '';
    }
  };
  $('teamswap').addEventListener('pointerup', (e) => {
    e.preventDefault();
    const teams = s.teams;
    if (!teams || s.myTeam === null || s.teamsLocked) return;
    const next = teams[(teams.findIndex((t) => t.id === s.myTeam) + 1) % teams.length]!; // two teams: the other one
    send(s, { t: 'setTeam', teamId: next.id });
  });
  return {
    show,
    apply(t, locked) {
      s.teams = t && t.length > 1 ? t : null;
      s.teamsLocked = locked;
      if (!s.teams || (s.myId && !s.teams.some((x) => x.playerIds.includes(s.myId)))) show(null); // also a team the relay no longer has this phone in
      ($('teamswap') as HTMLButtonElement).disabled = locked;
      $('teamswap').textContent = locked ? 'Equipos bloqueados' : 'Cambiar de equipo';
    },
  };
}
