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

/** Pixels only on Linux: the baselines are rendered there (CI and the Playwright image). */
const SCREENSHOTS = process.platform === 'linux';

type Pin = {
    name: string;
    /** Brings the page into the pinned state. */
    open: (page: Page) => Promise<void>;
};

const PINS: Pin[] = [
    {
        name: 'empty',
        open: async (page) => {
            await page.goto('/ui/ext/tool-mail');
            await expect(page.getByTestId('connections-empty')).toBeVisible();
        },
    },
    {
        name: 'add',
        open: async (page) => {
            await page.goto('/ui/ext/tool-mail');
            await page.getByRole('button', { name: '+ Add account' }).click();
            await expect(page.getByLabel('Account id')).toBeVisible();
        },
    },
];

async function show(page: Page, pin: Pin, scheme: 'light' | 'dark'): Promise<void> {
    await page.emulateMedia({ colorScheme: scheme });
    await pin.open(page);
    await settle(page);
}

for (const pin of PINS) {
    test(pin.name, async ({ page }) => {
        const errors: string[] = [];

        page.on('console', (message) => {
            if (message.type() === 'error') {
                errors.push(message.text());
            }
        });
        page.on('pageerror', (error) => {
            errors.push(error.message);
        });

        await page.clock.install();
        await signInBeforeLoad(page);
        await show(page, pin, 'light');

        const text = await renderedText(page);

        expect(text).not.toMatch(/\bchamvi[A-Z]\w*\.|\{\{/);
        expect(normalize(text)).toMatchSnapshot(`${pin.name}.txt`);

        if (SCREENSHOTS) {
            await freeze(page);
            await expect(page).toHaveScreenshot(`${pin.name}-light.png`, { fullPage: true, mask: VOLATILE(page) });
            await page.clock.resume();
            await show(page, pin, 'dark');
            await freeze(page);
            await expect(page).toHaveScreenshot(`${pin.name}-dark.png`, { fullPage: true, mask: VOLATILE(page) });
        }

        expect(errors).toEqual([]);
    });
}
