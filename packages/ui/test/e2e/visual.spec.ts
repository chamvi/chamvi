/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
    VOLATILE,
    freeze,
    normalize,
    renderedText,
    settle,
    signInBeforeLoad,
} from './visual.ts';
import { pinRun } from './pins.ts';

/** Pixels only on Linux: the baselines are rendered there (CI and the Playwright image). */
const SCREENSHOTS = process.platform === 'linux';

type Route = {
    name: string;
    path: (runId: string) => string;
    /** Signed out: the login page. */
    signedOut?: boolean;
    /** Also pinned at phone width. */
    phone?: boolean;
    /** What shows once the page has loaded its data. */
    ready: (page: Page) => Promise<void>;
};

const heading = (name: string) => async (page: Page) => {
    await expect(page.getByRole('heading', {
        name,
        exact: true,
        level: 1,
    })).toBeVisible();
};

const ROUTES: Route[] = [
    {
        name: 'login',
        path: () => 'login',
        signedOut: true,
        ready: heading('Sign in'),
    },
    {
        name: 'agents',
        path: () => 'agents',
        phone: true,
        ready: async (page) => {
            await expect(page.locator('[data-testid="agent-card"][data-agent="deploy"]')).toBeVisible();
        },
    },
    {
        name: 'agent-deploy',
        path: () => 'agents/deploy',
        ready: async (page) => {
            await expect(page.getByTestId('recent-runs').locator('a').first()).toBeVisible();
        },
    },
    {
        name: 'agent-digest-state',
        path: () => 'agents/digest?tab=state',
        ready: async (page) => {
            await expect(page.getByTestId('kv')).toContainText('last_digest_at');
        },
    },
    {
        name: 'agent-digest-schedules',
        path: () => 'agents/digest?tab=schedules',
        ready: async (page) => {
            await expect(page.getByTestId('schedule').first()).toBeVisible();
        },
    },
    {
        name: 'runs',
        path: () => 'runs',
        ready: async (page) => {
            await expect(page.getByTestId('runs').locator('tbody tr').first()).toBeVisible();
        },
    },
    {
        name: 'run',
        path: (runId) => `runs/${runId}`,
        phone: true,
        ready: async (page) => {
            await expect(page.getByTestId('status').first()).toHaveText('waiting');
            await expect(page.getByTestId('timeline').getByTestId('step').filter({ hasText: 'calls deploy' })).toBeVisible();
        },
    },
    {
        name: 'approvals',
        path: () => 'approvals',
        ready: async (page) => {
            await expect(page.getByTestId('approval').first()).toBeVisible();
        },
    },
    {
        name: 'schedules',
        path: () => 'schedules',
        ready: async (page) => {
            await expect(page.getByTestId('schedule').first()).toBeVisible();
        },
    },
    {
        name: 'components',
        path: () => 'components',
        ready: async (page) => {
            await expect(page.locator('tr[data-component="cron"]')).toBeVisible();
        },
    },
    {
        name: 'connections',
        path: () => 'connections',
        ready: async (page) => {
            await expect(page.getByTestId('connections').locator('[data-connection="whatsapp"]')).toBeVisible();
        },
    },
    {
        name: 'connection-whatsapp',
        path: () => 'connections/whatsapp',
        ready: async (page) => {
            await expect(page.getByTestId('connection-status')).toHaveText('pairing');
        },
    },
];

let runId = '';

test.beforeAll(async ({ request }) => {
    runId = await pinRun(request);
});

async function open(page: Page, route: Route): Promise<void> {
    if (!route.signedOut) {
        await signInBeforeLoad(page);
    }

    await page.goto(route.path(runId));
    await route.ready(page);
    await settle(page);
}

async function screenshot(page: Page, file: string): Promise<void> {
    await expect(page).toHaveScreenshot(file, { fullPage: true, mask: VOLATILE(page) });
}

test.describe('pages', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    for (const route of ROUTES) {
        test(route.name, async ({ page }) => {
            const errors = watchErrors(page);

            await page.clock.install();
            await page.emulateMedia({ colorScheme: 'light' });
            await open(page, route);

            const text = await renderedText(page);

            expect(text).not.toMatch(/\bchamvi[A-Z]\w*\.|\{\{/);
            expect(normalize(text)).toMatchSnapshot(`${route.name}.txt`);

            if (SCREENSHOTS) {
                await freeze(page);
                await screenshot(page, `${route.name}-light.png`);

                for (const scheme of ['dark', 'phone'] as const) {
                    if (scheme === 'phone' && !route.phone) {
                        continue;
                    }

                    await page.clock.resume();
                    await page.emulateMedia({ colorScheme: scheme === 'dark' ? 'dark' : 'light' });
                    await page.setViewportSize(scheme === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 800 });
                    await page.reload();
                    await route.ready(page);
                    await settle(page);
                    await freeze(page);
                    await screenshot(page, `${route.name}-${scheme}.png`);
                }
            }

            expect(errors).toEqual([]);
        });
    }
});

test.describe('pages in de-DE', () => {
    test.use({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });

    for (const route of ROUTES) {
        test(route.name, async ({ page }) => {
            await open(page, route);

            const text = await renderedText(page);

            expect(text).not.toMatch(/\bchamvi[A-Z]\w*\.|\{\{/);
            expect(normalize(text)).toMatchSnapshot(`${route.name}.txt`);
        });
    }
});

function watchErrors(page: Page): string[] {
    const errors: string[] = [];

    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });

    return errors;
}
