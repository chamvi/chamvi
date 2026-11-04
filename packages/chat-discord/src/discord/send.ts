/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { CHAT_REQUEST_ERROR_CODE } from '@chamvi/chat';
import type { ChatPlatformPost } from '@chamvi/chat';
import { ChamviError, ValidationError } from '@chamvi/core';
import { isObject } from 'smob';
import type { DiscordSend, DiscordSenderOptions } from './types.ts';

/** Discord's bound on a message nonce, in characters. */
const NONCE_LENGTH = 25;

/** The most characters of a refused answer's body an error repeats. */
const BODY_TEXT_MAX_LENGTH = 200;

/** A channel id the REST path takes: a snowflake. */
const SNOWFLAKE = /^\d+$/;

function requestError(message: string): ChamviError {
    return new ChamviError({ message, code: CHAT_REQUEST_ERROR_CODE });
}

function cut(text: string): string {
    return text.length > BODY_TEXT_MAX_LENGTH ? `${text.slice(0, BODY_TEXT_MAX_LENGTH)}…` : text;
}

/**
 * The nonce of one message: the first 25 hex characters of the sha256 of
 * `[channel, target, key]` as JSON, `target` the Discord channel or thread id
 * the message goes to. Every retry of one message sends the same nonce (it
 * goes to the same address), while a key core passes through unscoped (a
 * tool's explicit key) never collides across targets, channels or keys.
 */
export function nonceOf(channel: string, target: string, key: string): string {
    return createHash('sha256')
        .update(JSON.stringify([channel, target, key]))
        .digest('hex')
        .slice(0, NONCE_LENGTH);
}

/** The error of a non-2xx answer: its status, Discord's error code and message, the body cut, the token redacted. */
async function refusalOf(response: Response, token: string): Promise<ChamviError> {
    let text = '';

    try {
        text = (await response.text()).replaceAll(token, '[redacted]');
    } catch {
        // the status alone still names the refusal
    }

    let detail = cut(text);

    try {
        const body: unknown = JSON.parse(text);

        if (isObject(body) && (typeof body.code === 'number' || typeof body.message === 'string')) {
            const code = typeof body.code === 'number' ? ` (code ${body.code})` : '';
            const message = typeof body.message === 'string' ? `: ${cut(body.message)}` : '';

            return requestError(`Discord refused the message with status ${response.status}${code}${message}`);
        }
    } catch {
        // not JSON: the cut body text below
    }

    detail = detail.length > 0 ? `: ${detail}` : '';

    return requestError(`Discord refused the message with status ${response.status}${detail}`);
}

/**
 * Discord's REST send for the chat channel's `prepare`: decodes the thread id
 * when the post is built (a thread id that is not Discord's, or names no
 * channel snowflake, throws before anything is sent), then the post reads the
 * token and does one `POST {apiUrl}/channels/<thread or channel>/messages`
 * with no pings (`allowed_mentions.parse` empty) and an enforced nonce from
 * nonceOf() over the channel name, the target and the key, passing the
 * signal to `fetch`. No retry of its own: a 429 or any non-2xx is a
 * `chat_request` naming the status and Discord's code. The token is only ever in the Authorization header: no error carries it, a
 * token provider's own error or a network error's message.
 */
export function createDiscordSender(options: DiscordSenderOptions): (send: DiscordSend) => ChatPlatformPost {
    const base = options.apiUrl.replace(/\/+$/, '');

    return (send: DiscordSend): ChatPlatformPost => {
        const { channelId, threadId } = options.adapter.decodeThreadId(send.threadId);
        const target = threadId ?? channelId;

        if (typeof target !== 'string' || !SNOWFLAKE.test(target)) {
            throw new ValidationError('The Discord thread id names no channel to send to.');
        }

        const url = `${base}/channels/${target}/messages`;
        const body = JSON.stringify({
            content: send.text,
            allowed_mentions: { parse: [] },
            nonce: nonceOf(send.channel, target, send.key),
            enforce_nonce: true,
        });

        return async (signal: AbortSignal): Promise<unknown> => {
            signal.throwIfAborted();

            let token: string;

            try {
                token = await options.token();
            } catch {
                // never the provider's error: it could carry the token
                throw requestError('The Discord bot token provider failed; nothing was sent.');
            }

            signal.throwIfAborted();

            if (typeof token !== 'string' || token.length === 0) {
                throw requestError('The Discord bot token is empty; nothing was sent.');
            }

            let response: Response;

            try {
                response = await options.fetch(url, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bot ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body,
                    signal,
                });
            } catch (error) {
                if (signal.aborted && error === signal.reason) {
                    throw error;
                }

                // never the fetch error's text: a transport may echo the request
                throw requestError('The Discord REST request failed before an answer; the message may still be delivered.');
            }

            if (!response.ok) {
                throw await refusalOf(response, token);
            }

            try {
                return await response.json();
            } catch {
                throw requestError(`Discord answered status ${response.status} with no message; the message may have been delivered.`);
            }
        };
    };
}
