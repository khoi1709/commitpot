import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/domain/**/*.test.ts', 'tests/mock/**/*.test.ts', 'tests/qr/**/*.test.ts', 'tests/chain/**/*.test.ts'] } });
