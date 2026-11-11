import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'test/e2e',
    // no path aliases: what the server imports is the built packages
    tsconfig: './tsconfig.build.json',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://127.0.0.1:4175',
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        // the demo app runs against the built packages (npm run build first)
        command: 'node test/e2e/demo/server.ts',
        url: 'http://127.0.0.1:4175/healthz',
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
    },
});
