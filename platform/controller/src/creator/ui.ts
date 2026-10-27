// The browser side of the creator: mounts the view, the preview loop and the lobby's "Editar personaje" button. creator.ts knows none of it (so it runs under node in tests).
import type { Flow } from './flow';
import { createPreview, type DrawAvatar } from './preview';
import { createView, type Actions } from './view';

export interface Ui {
  render(f: Flow, dup: string | null): void;
  /** Preview loop on or off; `chrome` marks whether the creator covers the page and whether the lobby may offer "Editar personaje". */
  show(open: boolean, previewOn: boolean, canEdit: boolean): void;
}

export function createUi(draw: DrawAvatar, act: Actions, getAp: () => Flow['ap'], color: () => string): Ui {
  const view = createView(draw, act, color);
  document.body.appendChild(view.root);
  const preview = createPreview(view.canvas, draw, () => ({ ap: getAp(), slotColor: color() }));
  const edit = document.createElement('button');
  edit.id = 'cr-edit';
  edit.type = 'button';
  edit.textContent = 'Editar personaje';
  edit.addEventListener('pointerup', (e) => {
    e.preventDefault();
    act.edit();
  });
  document.getElementById('lobbybtns')?.appendChild(edit);
  let wanted = false;
  const sync = () => (wanted && !document.hidden ? preview.start() : preview.stop()); // a hidden page draws nothing
  document.addEventListener('visibilitychange', sync);
  return {
    render: (f, dup) => {
      view.render(f, dup);
      if (wanted) preview.frame();
    },
    show(open, previewOn, canEdit) {
      document.body.dataset.creator = open ? 'open' : 'closed';
      document.body.dataset.crEdit = canEdit ? 'on' : 'off';
      wanted = previewOn;
      sync();
    },
  };
}
