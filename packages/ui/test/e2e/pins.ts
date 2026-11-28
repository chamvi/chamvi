/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { E2E_TOKEN } from './demo/constants.ts';

const AUTH = { authorization: `Bearer ${E2E_TOKEN}` };

/**
 * The one waiting `deploy` run every pin shows, its id. Keyed, so each pin
 * spec and a retry find the same run: what the pages count stays one run.
 * The paths resolve against the project's `baseURL`, the pins' own server.
 */
export async function pinRun(request: APIRequestContext): Promise<string> {
    const response = await request.post('/agents/deploy/runs', {
        headers: { ...AUTH, 'idempotency-key': 'ui-pins' },
        data: { payload: { env: 'prod' } },
    });

    expect(response.status()).toBe(202);

    const { runId } = await response.json() as { runId: string };

    await expect.poll(async () => {
        const run = await request.get(`/runs/${runId}`, { headers: AUTH });

        return (await run.json() as { status: string }).status;
    }, { timeout: 15_000 }).toBe('waiting');

    return runId;
}
