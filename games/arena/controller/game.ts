// Arena on the phone: only the setup line. Its pad (stick and two buttons) and how-to come with the manifest through the config message.
import type { ControllerGame } from '@pichi/controller-kit';
import { DIFFICULTY_LABEL } from '@pichi/core';

export const arenaController: ControllerGame = {
  id: 'arena',
  setupLabel: (cfg) => `Último en pie · ${DIFFICULTY_LABEL[cfg.difficulty]}`,
};
