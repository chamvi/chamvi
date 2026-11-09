import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        // the sources, not dist
        alias: [
            { find: /^@chamvi\/app$/, replacement: fileURLToPath(new URL('../../app/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/app\/testing$/, replacement: fileURLToPath(new URL('../../app/src/testing/index.ts', import.meta.url)) },
            { find: /^@chamvi\/core$/, replacement: fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/core\/conversation\/persistence$/, replacement: fileURLToPath(new URL('../../core/src/conversation/persistence/index.ts', import.meta.url)) },
            { find: /^@chamvi\/http$/, replacement: fileURLToPath(new URL('../../http/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/channel-cron$/, replacement: fileURLToPath(new URL('../../channel-cron/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/store-db$/, replacement: fileURLToPath(new URL('../../store-db/src/index.ts', import.meta.url)) },
            { find: /^@chamvi\/chat-discord-ui\/module$/, replacement: fileURLToPath(new URL('../src/module/index.ts', import.meta.url)) },
            { find: /^@chamvi\/ui-kit$/, replacement: fileURLToPath(new URL('../../ui-kit/src/index.ts', import.meta.url)) },
            // a page's Vite build gets this from definePageConfig's icon plugin
            { find: /^virtual:chamvi-icons$/, replacement: fileURLToPath(new URL('../../ui-kit/test/utils/icons.ts', import.meta.url)) },
        ],
    },
    test: {
        include: ['test/unit/**/*.{test,spec}.{js,ts}'],
        passWithNoTests: false,
        testTimeout: 30_000,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
            },
        },
    },
});
