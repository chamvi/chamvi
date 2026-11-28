import { defineConfig, devices } from '@playwright/test';

/** The pin spec: rendered text and screenshots. */
const PINS = /visual\.spec\.ts/;

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
        baseURL: 'http://127.0.0.1:4178',
        trace: 'retain-on-failure',
    },
    // text pins hold on every platform; a screenshot is per platform (the baselines are Linux's: CI, the Playwright image)
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
        // the pins run first, against a fresh demo server
        {
            name: 'visual',
            testMatch: PINS,
            use: {
                ...devices['Desktop Chrome'],
                baseURL: 'http://127.0.0.1:4176',
                viewport: { width: 1280, height: 800 },
                locale: 'en-US',
                timezoneId: 'UTC',
                // grayscale text: LCD (subpixel) text flips per glyph when a layer is promoted, which differs from run to run
                launchOptions: { args: ['--disable-lcd-text'] },
            },
        },
        {
            name: 'chromium',
            testIgnore: PINS,
            dependencies: ['visual'],
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: [
        {
            // the demo app runs against the built packages (npm run build first)
            command: 'node test/e2e/demo/server.ts',
            url: 'http://127.0.0.1:4178/healthz',
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
        },
        // the pins' own server, started after the one above (its build included) and never reused
        {
            command: 'node test/e2e/demo/server.ts',
            env: { E2E_SERVER_PORT: '4176' },
            url: 'http://127.0.0.1:4176/healthz',
            reuseExistingServer: false,
            stdout: 'pipe',
        },
    ],
});
