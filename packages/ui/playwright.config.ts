import { defineConfig, devices } from '@playwright/test';

/** The pin specs: rendered text, screenshots and control states. */
const PINS = /(visual|states)\.spec\.ts/;

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
    // text and style pins hold on every platform; a screenshot is per platform (the baselines are Linux's: CI, the Playwright image)
    snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
    updateSnapshots: process.env.CI ? 'none' : 'missing',
    expect: {
        toHaveScreenshot: {
            pathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}-{platform}{ext}',
            maxDiffPixels: 0,
            animations: 'disabled',
            caret: 'hide',
        },
    },
    projects: [
        // the pins run first, against a fresh demo server: what they count is only their own run
        {
            name: 'visual',
            testMatch: PINS,
            use: {
                ...devices['Desktop Chrome'],
                locale: 'en-US',
                timezoneId: 'UTC',
            },
        },
        {
            name: 'chromium',
            testIgnore: PINS,
            dependencies: ['visual'],
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        // the demo app runs against the built packages (npm run build first); its *-ui page is built here
        command: 'npx vite build -c test/e2e/demo/page/vite.config.ts && node test/e2e/demo/server.ts',
        url: 'http://127.0.0.1:4173/healthz',
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
    },
});
