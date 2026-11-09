/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, test } from '@playwright/test';
import { E2E_ORIGIN, E2E_TOKEN } from './demo/constants.ts';

const AUTH = { authorization: `Bearer ${E2E_TOKEN}` };

test('pairs live: QR while pairing, gone once connected, reset pairs again', async ({ page, request }) => {
    const errors: string[] = [];

    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    page.on('dialog', (dialog) => {
        errors.push(`browser dialog: ${dialog.message()}`);
        void dialog.dismiss();
    });

    // a known start whatever ran before (a retry included): pairing with a QR
    expect((await request.post(`${E2E_ORIGIN}/connections/whatsapp/reset`, { headers: AUTH })).status()).toBe(202);

    await page.goto('/ui/ext/chat-whatsapp');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Bearer token').fill(E2E_TOKEN);
    await page.getByRole('button', { name: 'Use token' }).click();

    await expect(page.getByTestId('connection-status')).toHaveText('pairing');
    await expect(page.locator('[data-account="whatsapp"]')).toBeVisible();

    const qr = page.getByTestId('connection-qr');

    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('src', /^data:image\/svg\+xml,/);
    // the image really decoded under the page's CSP
    expect(await qr.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    // the pairing string itself is never on the page as text
    await expect(page.getByText('demo-pairing-material')).toHaveCount(0);

    expect((await request.post(`${E2E_ORIGIN}/demo/connect`, { headers: AUTH })).status()).toBe(204);
    await expect(page.getByTestId('connection-status')).toHaveText('connected');
    await expect(qr).toHaveCount(0);

    // reset asks in the page, then a new QR arrives over the stream
    await page.getByTestId('connection-reset').click();
    await expect(page.getByTestId('connection-reset-confirm')).toBeVisible();
    await expect(page.getByTestId('connection-reset-keep')).toBeFocused();
    await page.getByTestId('connection-reset-keep').click();
    await expect(page.getByTestId('connection-reset')).toBeFocused();
    await page.getByTestId('connection-reset').click();
    await page.getByTestId('connection-reset-yes').click();
    await expect(page.getByTestId('connection-status')).toHaveText('pairing');
    await expect(qr).toBeVisible();
    await expect(page.getByTestId('connection-reset-confirm')).toHaveCount(0);
    expect(errors).toEqual([]);
});
