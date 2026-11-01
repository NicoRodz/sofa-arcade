// Binds this build's games to the screen shell. It is the first import of main.ts after mount.ts: ES modules evaluate in import order, so the shell reads the catalog
// already bound when it builds its state.
import { CATALOG, DEFAULT_CONFIG } from '@pichi/catalog';
import { bindCatalog } from '@pichi/screen-kit/shell';

bindCatalog(CATALOG, DEFAULT_CONFIG);
