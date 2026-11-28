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

/**
 * What a control's look is made of (Chromium reads the `font` shorthand as
 * empty). A content-sized width and the auto margin next to it follow the
 * OS's text metrics, so the pins are per platform, as the screenshots are.
 */
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
    'opacity',
    'cursor',
    'margin',
    'width',
    'min-width',
    'display',
    'gap',
    'letter-spacing',
    'text-transform',
    'transform',
];

type Control = {
    name: string;
    /** The page it is on, under `/ui/`. */
    path: (runId: string) => string;
    locate: (page: Page) => Locator;
    /**
     * What is read besides rest, hover and keyboard focus: a button also
     * pressed (`:active`) and disabled, a field its placeholder; a container
     * (a row, a card) only rest and hover, an overlay only rest.
     */
    kind?: 'button' | 'field' | 'container' | 'overlay';
    /** Brings the control up first (an overlay). */
    open?: (page: Page) => Promise<void>;
};

/** Opens the start-run dialog of the agent page, unless it is open. */
async function openStartRun(page: Page): Promise<void> {
    const dialog = page.getByRole('dialog');

    if (await dialog.isVisible()) {
        return;
    }

    await page.getByRole('button', { name: 'Start run' }).first().click();
    await expect(dialog).toBeVisible();
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

/** Grouped by page, so each page loads once per scheme. */
const CONTROLS: Control[] = [
    {
        name: 'primary button',
        kind: 'button',
        path: () => 'approvals',
        locate: (page) => page.getByTestId('approve'),
    },
    {
        name: 'button',
        kind: 'button',
        path: () => 'approvals',
        locate: (page) => page.getByTestId('deny'),
    },
    {
        name: 'textarea',
        kind: 'field',
        path: () => 'approvals',
        locate: (page) => page.getByPlaceholder('Why, in one line'),
    },
    // the shell's icon buttons are the dashboard's ghost buttons (`.btn-ghost` shows only for a stored secret)
    {
        name: 'ghost button',
        kind: 'button',
        path: () => 'agents',
        locate: (page) => page.getByRole('button', { name: 'Sign out' }),
    },
    {
        name: 'text input',
        kind: 'field',
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
        name: 'agent card',
        kind: 'container',
        path: () => 'agents',
        locate: (page) => page.locator('[data-testid="agent-card"][data-agent="deploy"]'),
    },
    {
        name: 'danger button',
        kind: 'button',
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
        kind: 'field',
        path: () => 'runs',
        locate: (page) => page.getByLabel('Agent', { exact: true }),
    },
    {
        name: 'pagination link',
        kind: 'button',
        path: () => 'runs',
        locate: (page) => page.getByRole('button', { name: 'Page 2', exact: true }),
    },
    {
        // its row's hover styles land on the cells: hovering the cell hovers the row
        name: 'runs table row cell',
        kind: 'container',
        path: () => 'runs',
        locate: (page) => page.getByTestId('runs').locator('tbody tr').first().locator('td').first(),
    },
    {
        name: 'date input',
        kind: 'field',
        path: () => 'runs',
        locate: (page) => page.getByLabel('Created from'),
    },
    {
        name: 'date preset',
        kind: 'button',
        path: () => 'runs',
        locate: (page) => page.getByRole('group', { name: 'Created in' }).getByRole('button', { name: 'Today' }),
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
    // the overlay last on its page: open, it covers the page under it
    {
        name: 'start-run dialog',
        kind: 'overlay',
        path: () => 'agents/deploy',
        open: openStartRun,
        locate: (page) => page.getByRole('dialog'),
    },
    {
        name: 'start-run dialog primary button',
        path: () => 'agents/deploy',
        open: openStartRun,
        locate: (page) => page.getByRole('dialog').getByRole('button', { name: 'Start run' }),
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
    await control.open?.(page);

    const target = control.locate(page);

    await expect(target).toBeVisible();

    const rest = await readStyle(target);

    if (control.kind === 'overlay') {
        return { rest };
    }

    await target.hover();

    const hover = await readStyle(target);

    await page.mouse.move(0, 0);

    if (control.kind === 'container') {
        return { rest, hover };
    }

    // a key press first, so the focus below counts as keyboard focus (`:focus-visible`)
    await page.keyboard.press('Shift');
    await target.focus();

    const focusVisible = await target.evaluate((element) => element.matches(':focus-visible'));
    const focus = await readStyle(target);

    await target.blur();

    const states: Record<string, unknown> = {
        rest,
        hover,
        focus,
        focusVisible,
    };

    if (control.kind === 'field') {
        states.placeholder = await target.evaluate((element) => {
            const style = getComputedStyle(element, '::placeholder');

            return { color: style.color, opacity: style.opacity };
        });
    }

    if (control.kind === 'button') {
        // pressed, then released off the button: no click reaches it (an Approve or a Cancel run would act)
        await target.hover();
        await page.mouse.down();
        states.active = await readStyle(target);
        await page.mouse.move(0, 0);
        await page.mouse.up();
        await target.blur();

        await target.evaluate((element) => element.setAttribute('disabled', ''));
        states.disabled = await readStyle(target);
        await target.evaluate((element) => element.removeAttribute('disabled'));
    }

    return states;
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

        expect(`${JSON.stringify(states, null, 4)}\n`).toMatchSnapshot(`states-${scheme}-${process.platform}.json`);
    });
}
