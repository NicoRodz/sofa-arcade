// Binds this build's games to the screen shell. It is the first import of main.ts after mount.ts: ES modules evaluate in import order, so the shell reads the catalog
// already bound when it builds its state. With `?soon=1` (soonEnabled, the same switch the start menu reads) the games in development are part of it; without, the menu is the published one.
import { CATALOG, DEFAULT_CONFIG, DEV_CATALOG } from '@pichi/catalog';
import { bindCatalog, soonEnabled } from '@pichi/screen-kit/shell';

bindCatalog(soonEnabled() ? DEV_CATALOG : CATALOG, DEFAULT_CONFIG);
