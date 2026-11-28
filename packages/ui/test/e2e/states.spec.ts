/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { pinRun } from './pins.ts';
import { settle, signInBeforeLoad } from './visual.ts';

/** What a control's look is made of (Chromium reads the `font` shorthand as empty). */
const PROPERTIES = [
    'color',
    'background-color',
    'border-color',
    'border-width',
    'border-radius',
    'box-shadow',
    'outline',
    'padding',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'height',
    'text-decoration',
];

type Control = {
    name: string;
    /** The page it is on, under `/ui/`. */
    path: (runId: string) => string;
    locate: (page: Page) => Locator;
};

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

/** Grouped by page, so each page loads once per scheme. */
const CONTROLS: Control[] = [
    {
        name: 'primary button',
        path: () => 'approvals',
        locate: (page) => page.getByTestId('approve'),
    },
    {
        name: 'button',
        path: () => 'approvals',
        locate: (page) => page.getByTestId('deny'),
    },
    {
        name: 'textarea',
        path: () => 'approvals',
        locate: (page) => page.getByPlaceholder('Why, in one line'),
    },
    // the shell's icon buttons are the dashboard's ghost buttons (`.btn-ghost` shows only for a stored secret)
    {
        name: 'ghost button',
        path: () => 'agents',
        locate: (page) => page.getByRole('button', { name: 'Sign out' }),
    },
    {
        name: 'text input',
        path: () => 'agents',
        locate: (page) => page.getByLabel('Filter by name'),
    },
    {
        name: 'sidebar nav item',
        path: () => 'agents',
        locate: (page) => nav(page).getByRole('link', { name: 'Runs', exact: true }),
    },
    {
        name: 'sidebar nav item (current)',
        path: () => 'agents',
        locate: (page) => nav(page).getByRole('link', { name: 'Agents', exact: true }),
    },
    {
        name: 'danger button',
        path: (runId) => `runs/${runId}`,
        locate: (page) => page.getByRole('button', { name: 'Cancel run' }),
    },
    {
        name: 'collapse trigger',
        path: (runId) => `runs/${runId}`,
        locate: (page) => page.getByTestId('timeline').getByRole('button', { name: /Envelope \(first user message\)/ }),
    },
    {
        name: 'select trigger',
        path: () => 'runs',
        locate: (page) => page.getByLabel('Agent', { exact: true }),
    },
    {
        name: 'pagination link',
        path: () => 'runs',
        locate: (page) => page.getByRole('button', { name: 'Page 2', exact: true }),
    },
    {
        name: 'tab',
        path: () => 'agents/deploy',
        locate: (page) => page.getByRole('tab', { name: /^Runs/ }),
    },
    {
        name: 'plain link',
        path: () => 'agents/deploy',
        locate: (page) => page.getByRole('link', { name: 'All runs of deploy' }),
    },
];

/** Above the runs page size (25), so the runs table shows its pager. */
const PAGED_TOTAL = 60;

let runId = '';

test.beforeAll(async ({ request }) => {
    runId = await pinRun(request);
});

async function readStyle(control: Locator): Promise<Record<string, string>> {
    return control.evaluate((element, properties) => {
        const style = getComputedStyle(element);

        return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
    }, PROPERTIES);
}

async function readStates(page: Page, control: Control) {
    const target = control.locate(page);

    await expect(target).toBeVisible();

    const rest = await readStyle(target);

    await target.hover();

    const hover = await readStyle(target);

    await page.mouse.move(0, 0);
    // a key press first, so the focus below counts as keyboard focus (`:focus-visible`)
    await page.keyboard.press('Shift');
    await target.focus();

    const focusVisible = await target.evaluate((element) => element.matches(':focus-visible'));
    const focus = await readStyle(target);

    await target.blur();

    return {
        rest,
        hover,
        focus,
        focusVisible,
    };
}

for (const scheme of ['light', 'dark'] as const) {
    test(`control states, ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await signInBeforeLoad(page);
        // more runs than a page holds, so the runs table shows its pager
        await page.route((url) => url.pathname === '/runs', async (route) => {
            const response = await route.fetch();
            const body = await response.json() as { meta: { total: number } };

            await route.fulfill({ response, json: { ...body, meta: { ...body.meta, total: PAGED_TOTAL } } });
        });

        const states: Record<string, unknown> = {};
        let path = '';

        for (const control of CONTROLS) {
            if (control.path(runId) !== path) {
                path = control.path(runId);
                await page.goto(path);
                await settle(page);
                // a transition would leave hover and focus half way when they are read
                await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
            }

            states[control.name] = await readStates(page, control);
        }

        expect(`${JSON.stringify(states, null, 4)}\n`).toMatchSnapshot(`states-${scheme}.json`);
    });
}
