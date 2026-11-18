# Setup result

## Scope

Completed only the setup scope: `apps/web` configuration and manifest, root lockfile/ignore rules, and this report. No source files, contracts, servers, Git operations, Fuji access, keys, global tools, or lifecycle scripts were used.

## Configuration written

- `apps/web/tsconfig.json`: strict TypeScript, ES2022 target/lib, Next plugin, bundler resolution, and `@/*` → `./src/*` alias.
- `apps/web/next-env.d.ts`: standard Next and `next/image-types/global` references.
- `apps/web/postcss.config.mjs`: Tailwind 4 `@tailwindcss/postcss` plugin.
- `.gitignore`: dependency/build/cache/env exclusions.
- `apps/web/package.json`: patched compatible Next 15/React 19 versions; existing viem, wagmi, Tailwind, and Vitest retained.

## Commands and outcomes

- `pnpm --version` → `11.25.0`.
- Registry metadata: `next@15` → `15.5.29`; `react@19`/`react-dom@19` → `19.3.1`; `@types/node@22` → `22.20.5`; `@types/react@19`/`@types/react-dom@19` → `19.3.0`.
- `pnpm install --ignore-scripts` → exit 0; lockfile created/updated; 420 packages installed. pnpm reported 13 deprecated transitive packages and peer-dependency warnings. No lifecycle scripts ran.
- `pnpm --filter @commitpot/web exec tsc --version` → `Version 5.9.3`.
- `pnpm --filter @commitpot/web exec vitest --version` → `vitest/3.2.4 win32-x64 node-v22.22.3`.
- `pnpm --filter @commitpot/web exec next --version` → `Next.js v15.5.29`.
- `pnpm --filter @commitpot/web typecheck` → exit 0.
- `pnpm --filter @commitpot/web test` → exit 1: `No test files found, exiting with code 1` (Vitest include: `**/*.{test,spec}.?(c|m)[jt]s?(x)`).

Installed direct versions: Next 15.5.29, React/React DOM 19.3.1, viem 2.38.5, wagmi 2.19.0, Tailwind/Tailwind PostCSS 4.1.16, Vitest 3.2.4, TypeScript 5.9.3, @types/node 22.20.5, @types/react 19.3.0, @types/react-dom 19.3.0.

No whole-app build was run because the app is not implemented. Remaining issue: no tests exist yet, so the configured Vitest command exits 1.

## Scope release

Setup writer scope is released. The next worker may use the installed local toolchain and modify only its separately assigned paths.
