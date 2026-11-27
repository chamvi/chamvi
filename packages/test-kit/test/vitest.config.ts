import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        // the sources, not dist
        alias: [
            { find: /^@chamvi\/access$/, replacement: fileURLToPath(new URL('../../access/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/errors$/, replacement: fileURLToPath(new URL('../../errors/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/core$/, replacement: fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/core-kit$/, replacement: fileURLToPath(new URL('../../core-kit/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/store$/, replacement: fileURLToPath(new URL('../../store/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/store-memory$/, replacement: fileURLToPath(new URL('../../store-memory/src/index.ts', import.meta.url)) },
            // createTestDataSource loads it by a variable specifier; no dependency field names it
            { find: /^@chamvi\/store-db$/, replacement: fileURLToPath(new URL('../../store-db/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/test-kit$/, replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
        ],
    },
    test: {
        include: ['test/unit/**/*.{test,spec}.{js,ts}'],
        passWithNoTests: false,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx,js,jsx}'],
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
            },
        },
    },
});
