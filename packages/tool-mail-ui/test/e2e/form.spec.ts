/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_TOKEN } from './demo/constants.ts';

// the second test deletes the account the first one added
test.describe.configure({ mode: 'serial' });

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

test('adds a mail account, sees restart to apply, reload keeps the session', async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto('/ui/ext/tool-mail');
    await signIn(page);

    await expect(page.getByTestId('connections-empty')).toBeVisible();
    await page.getByRole('button', { name: '+ Add account' }).click();
    await page.getByLabel('Account id').fill('work');
    await page.getByLabel('Address').fill('agent@example.com');
    await page.getByLabel('IMAP host').fill('imap.example.com');
    await page.locator('[data-field="password"] input').fill('s3cret-value');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Saved. Restart the app to apply.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mail account: work' })).toBeVisible();
    await expect(page.getByTestId('secret-set')).toHaveText('Set');
    await expect(page.locator('[data-field="password"] input')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('connection')).toBe('mail-work');
    await expect(page.locator('[data-account="mail-work"]')).toBeVisible();

    await page.reload();

    await expect(page.getByTestId('principal')).toHaveText('e2e');
    await expect(page.getByText('Saved. Restart the app to apply.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mail account: work' })).toBeVisible();
    await expect(page.getByLabel('IMAP host')).toHaveValue('imap.example.com');
    await expect(page.locator('body')).not.toContainText('s3cret-value');
    expect(await page.evaluate(() => sessionStorage.getItem('chamvi.token'))).toBe(E2E_TOKEN);
    expect(errors).toEqual([]);
});

test('deletes the account after a confirmation in the page and opens nothing stale', async ({ page }) => {
    const errors = watchErrors(page);

    await page.goto('/ui/ext/tool-mail?connection=mail-work');
    await signIn(page);

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText('work');
    await page.getByRole('button', { name: 'Delete account' }).click();

    await expect(page.getByTestId('connections-empty')).toBeVisible();
    await expect(page.locator('[data-account="mail-work"]')).toHaveCount(0);
    await expect(page.getByTestId('connection-form-error')).toHaveCount(0);
    expect(errors).toEqual([]);
});
