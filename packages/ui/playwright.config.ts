import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'test/e2e',
    // no path aliases: what a spec imports from the app reaches the built kit, not its Vue sources
    tsconfig: './tsconfig.build.json',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://127.0.0.1:4173/ui/',
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        // the demo app runs against the built packages (npm run build first); its *-ui page is built here
        command: 'npx vite build -c test/e2e/demo/page/vite.config.ts && node test/e2e/demo/server.ts',
        url: 'http://127.0.0.1:4173/healthz',
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
    },
});
