import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/integration/**', 'tests/e2e/**'],
  },
});
