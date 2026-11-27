import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (name: string) => fileURLToPath(new URL(`../../${name}/src/index.ts`, import.meta.url));

export default defineConfig({
    resolve: {
        // the sources, not dist
        alias: [
            { find: /^@chamvi\/http-kit$/, replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/access$/, replacement: source('access') },
            { find: /^@chamvi\/errors$/, replacement: source('errors') },
            { find: /^@chamvi\/core$/, replacement: source('core') },
            { find: /^@chamvi\/core-kit$/, replacement: source('core-kit') },
            { find: /^@chamvi\/http$/, replacement: source('http') },
            { find: /^@chamvi\/store$/, replacement: source('store') },
            { find: /^@chamvi\/store-memory$/, replacement: source('store-memory') },
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
