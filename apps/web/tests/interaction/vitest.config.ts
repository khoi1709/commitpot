import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/interaction/**/*.test.ts'], environment: 'node' } });
