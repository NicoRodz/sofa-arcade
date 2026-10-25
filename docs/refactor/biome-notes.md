# Biome in F1: what is on and what is deliberately not yet

`npm run lint` = `biome check`. Formatter, import sorting and html/css are off (F2 is the single mass-format commit). Excluded: data, fixtures, levels, golden(s), dist, docs.

Current state (commit of F1.4): 0 errors, 76 warnings, 3 infos; exit code 0.

Demoted so the existing code passes without touching it. F2 and F3-F5 promote them:

| Rule | State now | Hits | Plan |
|---|---|---:|---|
| style/useImportType | warn | 22 | F2 autofix, then error (requested rule) |
| correctness/noUnusedImports | warn | 9 | F2 autofix, then error (requested rule) |
| correctness/noUnusedVariables | warn | 12 | fix when the file is touched |
| correctness/noSwitchDeclarations, noConstantCondition | warn | 1 + 1 | fix when the file is touched |
| suspicious/noAssignInExpressions | warn | 16 | fix when the file is split |
| complexity/noCommaOperator, useOptionalChain | warn | 3 + 5 | fix when the file is touched |
| style/noNonNullAssertion | off | 2783 | house style with `noUncheckedIndexedAccess` |
| suspicious/useIterableCallbackReturn | off | 202 | house style (`forEach((x) => set.add(x))`) |
| suspicious/noExplicitAny | off | 100 | revisit at F6 |
| correctness/noUnusedFunctionParameters, style/useTemplate, complexity/useLiteralKeys | off | 5 / 52 / 6 | noise |

Because the two requested rules are `warn`, `biome check` exits 0 with violations. After F2 run `biome check --error-on-warnings` in the gate, or promote them to `error` in biome.json.

Heads-up for F2: `useImportType` rewrites `import Phaser from 'phaser'` to `import type` in ~12 screen/src/art files (Phaser only used as a type there); safe, but review the diff.
