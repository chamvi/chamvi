/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_PAGE_LABEL, E2E_PAGE_SLUG, E2E_TOKEN } from './demo/constants.ts';

const PAGE_PATH = `/ui/ext/${E2E_PAGE_SLUG}`;

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

async function signIn(page: Page): Promise<void> {
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Bearer token').fill(E2E_TOKEN);
    await page.getByRole('button', { name: 'Use token' }).click();
}

test('a registered page link does a full navigation and the session survives', async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto('');
    await signIn(page);
    await expect(page.getByTestId('principal')).toHaveText('e2e');
    await page.evaluate(() => {
        (window as unknown as { marker: boolean }).marker = true;
    });

    await page.getByRole('link', { name: E2E_PAGE_LABEL }).click();

    await expect(page.getByTestId('demo-page')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(PAGE_PATH);
    expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBeUndefined();
    await expect(page.getByTestId('principal')).toHaveText('e2e');
    await expect(page.getByRole('link', { name: E2E_PAGE_LABEL })).toHaveAttribute('aria-current', 'page');

    // the shell's fixed items lead back to the dashboard
    await page.getByRole('link', { name: 'Runs' }).click();
    await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible();
    await expect(page.getByTestId('principal')).toHaveText('e2e');
    expect(errors).toEqual([]);
});

test('a deep link to a page reloads the page, not the dashboard fallback', async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto('');
    await signIn(page);
    await expect(page.getByTestId('principal')).toHaveText('e2e');
    await page.goto(`${PAGE_PATH}/accounts/work`);
    await expect(page.getByTestId('demo-page')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('demo-page')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`${PAGE_PATH}/accounts/work`);
    expect(errors).toEqual([]);
});

test('a page that needs sign-in returns to itself afterwards', async ({ page }) => {
    await page.goto(`${PAGE_PATH}?tab=a`);
    await signIn(page);
    await expect(page.getByTestId('demo-page')).toBeVisible();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(`${PAGE_PATH}?tab=a`);
});

test('an off-site return path stays in the dashboard', async ({ page }) => {
    await page.goto(`login?redirect=${encodeURIComponent('//evil.example/x')}`);
    await signIn(page);
    await expect(page.getByTestId('principal')).toHaveText('e2e');
    expect(new URL(page.url()).origin).toBe('http://127.0.0.1:4173');
    expect(new URL(page.url()).pathname).toBe('/ui/agents');
});
