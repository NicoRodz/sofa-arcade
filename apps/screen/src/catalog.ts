// Binds this build's games to the screen shell. It is the first import of main.ts after mount.ts: ES modules evaluate in import order, so the shell reads the catalog
// already bound when it builds its state. With `?soon=1` (the page's development switch, same parameter as platform/screen/src/dev-flags.ts, which the screen kit
// does not publish) the games in development are part of it; without, the menu is the published one.
import { CATALOG, DEFAULT_CONFIG, DEV_CATALOG } from '@pichi/catalog';
import { bindCatalog } from '@pichi/screen-kit/shell';

const soon = new URLSearchParams(location.search).get('soon') === '1';
bindCatalog(soon ? DEV_CATALOG : CATALOG, DEFAULT_CONFIG);
