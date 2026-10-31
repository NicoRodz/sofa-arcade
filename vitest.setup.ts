// Test-only: binds this build's games to the screen shell, as apps/screen/src/catalog.ts does at boot, so the tests that import the shell find the catalog bound.
import { CATALOG, DEFAULT_CONFIG } from '@pichi/catalog';
import { bindCatalog } from '@pichi/screen-kit/shell/catalog';

bindCatalog(CATALOG, DEFAULT_CONFIG);
