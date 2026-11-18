import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        swc.vite({
            jsc: {
                parser: {
                    syntax: 'typescript',
                    decorators: true,
                },
                transform: {
                    legacyDecorator: true,
                    decoratorMetadata: false,
                },
            },
        }),
    ],
    resolve: {
        // the sources, not dist
        alias: [
            { find: /^@chamvi\/access$/, replacement: fileURLToPath(new URL('../../access/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/core$/, replacement: fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/store$/, replacement: fileURLToPath(new URL('../../store/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/store-memory$/, replacement: fileURLToPath(new URL('../../store-memory/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/store-db$/, replacement: fileURLToPath(new URL('../../store-db/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/knowledge$/, replacement: fileURLToPath(new URL('../../knowledge/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/test-kit$/, replacement: fileURLToPath(new URL('../../test-kit/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/store-db-vector$/, replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
        ],
    },
    test: {
        globalSetup: ['test/global-setup.ts'],
        include: ['test/unit/**/*.{test,spec}.{js,ts}'],
        passWithNoTests: false,
        // every spec file creates its own database on the one server
        maxWorkers: 4,
        testTimeout: 30_000,
        hookTimeout: 60_000,
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
