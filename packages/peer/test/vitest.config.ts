import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (name: string) => fileURLToPath(new URL(`../../${name}/src/index.ts`, import.meta.url));

export default defineConfig({
    resolve: {
        // the sources, not dist
        alias: [
            { find: /^@chamvi\/peer$/, replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/peer\/module$/, replacement: fileURLToPath(new URL('../src/module/index.ts', import.meta.url)) },
            { find: /^@chamvi\/access$/, replacement: source('access') },
            { find: /^@chamvi\/app$/, replacement: source('app') },
            { find: /^@chamvi\/app\/testing$/, replacement: fileURLToPath(new URL('../../app/src/testing/index.ts', import.meta.url)) },
            { find: /^@chamvi\/channel-cron$/, replacement: source('channel-cron') },
            { find: /^@chamvi\/errors$/, replacement: source('errors') },
            { find: /^@chamvi\/core$/, replacement: source('core') },
            { find: /^@chamvi\/http$/, replacement: source('http') },
            { find: /^@chamvi\/http-kit$/, replacement: source('http-kit') },
            { find: /^@chamvi\/store$/, replacement: source('store') },
            { find: /^@chamvi\/store-db$/, replacement: source('store-db') },
            { find: /^@chamvi\/store-memory$/, replacement: source('store-memory') },
            { find: /^@chamvi\/test-kit$/, replacement: source('test-kit') },
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
