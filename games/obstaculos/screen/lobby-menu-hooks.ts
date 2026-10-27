// Obstaculos' half of the Captain's touch form on the TV: feeds the pure builder with the live lobby and carries out a touch with the lobby's own setters.
import { focusRow } from '@pichi/screen-kit/lobby/focus-nav-dom';
import { app, connectedCount, setConfig } from '@pichi/screen-kit/shell/app-state';
import { startRound } from '@pichi/screen-kit/shell/round-flow';
import type { MenuActResult } from '@pichi/screen-kit/shell/game';
import type { MenuActBody, MenuBody } from '@pichi/core';
import { toModeOptions } from '../lobby';
import { camp } from './campaign-link';
import { OBST_FOCUS_ROW, buildObstMenu, decideObstAct, type ObstLobbyState } from './lobby-menu';
import { obstOpts, run } from './run-state';

const state = (): ObstLobbyState => ({
  opts: obstOpts(),
  difficulty: app.config.difficulty,
  n: connectedCount(),
  seed: app.config.seed,
  notice: run.notice,
});

/** No form in the campaign hub (it has its own screens): the phone keeps its D-pad there. */
export const obstMenu = (): MenuBody | null => (camp.on ? null : buildObstMenu(state()));

export function obstMenuAct(act: MenuActBody, rev: number): MenuActResult {
  if (camp.on) return { ok: false, code: 'disabled', msg: 'Ahora no se puede' };
  const d = decideObstAct(state(), act, rev);
  if (!d.ok) return d;
  const e = d.effect;
  run.notice = '';
  if (e.kind === 'mode') setConfig({ modeOptions: toModeOptions({ ...obstOpts(), tether: e.value }) });
  else if (e.kind === 'level') setConfig({ modeOptions: toModeOptions({ ...obstOpts(), level: e.value }) });
  else if (e.kind === 'difficulty') setConfig({ difficulty: e.value });
  else if (e.kind === 'start') startRound();
  if (d.row && OBST_FOCUS_ROW[d.row]) focusRow(OBST_FOCUS_ROW[d.row]!);
  return { ok: true };
}
