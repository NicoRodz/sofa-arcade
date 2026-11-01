// Obstáculos on the phone: only the setup line. Its pad (stick, A/B, campaign signals) and how-to come with the manifest through the config message.
import type { ControllerGame } from '@pichi/controller-kit/contract';
import { DIFFICULTY_LABEL } from '@pichi/core/difficulty';
import { parseObstOptions, setupLabel } from '../lobby';

export const obstaculosController: ControllerGame = {
  id: 'obstaculos',
  setupLabel: (cfg) => setupLabel(parseObstOptions(cfg.modeOptions), cfg.difficulty, cfg.seed, DIFFICULTY_LABEL),
};
