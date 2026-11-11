/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, systemClock } from '@chamvi/core';
import { normalizePrivateKey } from '../auth/helpers.ts';
import { createInstallationTokens } from '../auth/module.ts';
import { GITHUB_REQUEST_ERROR_CODE } from '../tools/constants.ts';
import { normalizeAppId, normalizeBaseUrl } from './helpers.ts';
import type { GithubAppOptions } from './types.ts';

/** The fixed sentence of a failed `GET /app`: a bad JWT gets 401 or 403, a wrong API URL usually 404. */
function refusalOf(status: number | undefined): string {
    if (status === 401 || status === 403) {
        return 'GitHub refused the App ID or private key.';
    }

    if (status === 404) {
        return 'GitHub answered 404 at the configured API URL; a GitHub Enterprise Server URL ends in /api/v3.';
    }

    return 'GitHub cannot be reached at the configured API URL.';
}

/**
 * Creates the App's JWT and calls `GET /app` on its `baseUrl`, bounded by
 * `signal`. A malformed option is an InvalidAgentDefinitionError; a refusal or a
 * network failure is a fixed sentence, never GitHub's text.
 */
export async function verifyGithubApp(
    options: Pick<GithubAppOptions, 'appId' | 'privateKey' | 'baseUrl' | 'fetch' | 'clock'>,
    signal: AbortSignal,
): Promise<void> {
    signal.throwIfAborted();

    const tokens = createInstallationTokens({
        appId: normalizeAppId(options.appId),
        key: normalizePrivateKey(options.privateKey),
        clock: options.clock ?? systemClock,
        baseUrl: normalizeBaseUrl(options.baseUrl),
        fetch: options.fetch,
    });

    try {
        const octokit = await tokens.app();

        await octokit.request('GET /app', { request: { signal } });
    } catch (error) {
        signal.throwIfAborted();

        throw new ChamviError({
            message: refusalOf((error as { status?: number }).status),
            code: GITHUB_REQUEST_ERROR_CODE,
        });
    }
}
