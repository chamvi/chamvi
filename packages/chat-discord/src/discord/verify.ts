/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { CHAT_REQUEST_ERROR_CODE } from '@chamvi/chat';
import { ChamviError } from '@chamvi/core';
import { DISCORD_API_URL } from './constants.ts';

function failure(message: string): ChamviError {
    return new ChamviError({ message, code: CHAT_REQUEST_ERROR_CODE });
}

/**
 * `GET {apiUrl}/users/@me` with the bot token, bounded by `signal`. The token
 * is only in the header; a failure is a fixed sentence, never Discord's text.
 */
export async function verifyDiscordToken(
    token: string,
    options: { signal: AbortSignal; apiUrl?: string; fetch?: typeof fetch },
): Promise<void> {
    const { signal } = options;
    const base = (options.apiUrl ?? DISCORD_API_URL).replace(/\/+$/, '');
    const send = options.fetch ?? fetch;

    signal.throwIfAborted();

    let response: Response;

    try {
        response = await send(`${base}/users/@me`, { headers: { authorization: `Bot ${token}` }, signal });
    } catch {
        signal.throwIfAborted();

        throw failure('Discord cannot be reached.');
    }

    if (response.status === 401 || response.status === 403) {
        throw failure('Discord refused the bot token.');
    }

    if (!response.ok) {
        throw failure(`Discord answered with status ${response.status}.`);
    }
}
