import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/metadata/**/*.test.ts', 'tests/evidence/**/*.test.ts'] },
});
