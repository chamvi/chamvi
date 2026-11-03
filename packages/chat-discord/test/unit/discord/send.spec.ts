/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { createDiscordAdapter } from '@chat-adapter/discord';
import type { DiscordAdapter } from '@chat-adapter/discord';
import { ConsoleLogger } from 'chat';
import { describe, expect, it } from 'vitest';
import { CHAT_REQUEST_ERROR_CODE } from '@chamvi/chat';
import { DISCORD_API_URL } from '@chamvi/chat-discord';
import { createDiscordSender, nonceOf } from '../../../src/discord/send.ts';

const TOKEN = 'MTAwMDAw.sentinel-bot-token.SECRET';

type Call = { url: string; init: RequestInit };

type Fetch = typeof globalThis.fetch;

type FakeFetch = {
    fetch: Fetch;
    calls: Call[];
};

function fakeFetch(answer: (call: Call) => Response | Promise<Response> = () => Response.json({ id: 'm1' })): FakeFetch {
    const calls: Call[] = [];
    const recorder = (async (input: string | URL | Request, init?: RequestInit) => {
        const call = { url: String(input), init: init ?? {} };

        calls.push(call);

        return answer(call);
    }) as Fetch;

    return { fetch: recorder, calls };
}

/** A fetch that answers only once its signal aborts, rejecting with the reason. */
function hangingFetch(): FakeFetch {
    return fakeFetch(({ init }) => new Promise<Response>((_resolve, reject) => {
        const signal = init.signal!;

        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
}

function adapter(): DiscordAdapter {
    return createDiscordAdapter({
        botToken: 'unused-adapter-token',
        applicationId: '100000000000000009',
        apiUrl: DISCORD_API_URL,
        mentionRoleIds: [],
        respondToChannelIds: [],
        respondToGlobalMentions: false,
        webhookVerifier: () => false,
        logger: new ConsoleLogger('error'),
        userName: 'chamvi',
    });
}

function sender(fetch: Fetch, token: () => Promise<string> = async () => TOKEN) {
    return createDiscordSender({
        apiUrl: DISCORD_API_URL,
        token,
        fetch,
        adapter: adapter(),
    });
}

function bodyOf(call: Call): Record<string, unknown> {
    return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

function headersOf(call: Call): Headers {
    return new Headers(call.init.headers);
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error('expected a rejection');
}

describe('nonceOf', () => {
    it('is the first 25 hex characters of sha256 over [channel, target, key]', () => {
        const expected = createHash('sha256').update(JSON.stringify(['discord', '222', 'k1'])).digest('hex').slice(0, 25);

        expect(nonceOf('discord', '222', 'k1')).toBe(expected);
        expect(nonceOf('discord', '222', 'k1')).toHaveLength(25);
    });

    it('differs per key, per target and per channel, and is stable', () => {
        expect(nonceOf('discord', '222', 'k1')).toBe(nonceOf('discord', '222', 'k1'));
        expect(nonceOf('discord', '222', 'k1')).not.toBe(nonceOf('discord', '222', 'k2'));
        expect(nonceOf('discord', '222', 'k1')).not.toBe(nonceOf('discord', '333', 'k1'));
        expect(nonceOf('discord', '222', 'k1')).not.toBe(nonceOf('discord-ops', '222', 'k1'));
        // the encoding keeps the parts apart
        expect(nonceOf('a:b', '1', 'c')).not.toBe(nonceOf('a', '1', 'b:c'));
    });
});

describe('createDiscordSender', () => {
    it('posts a top-level message to its channel', async () => {
        const fake = fakeFetch();
        const post = sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        });

        await expect(post(new AbortController().signal)).resolves.toEqual({ id: 'm1' });
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]!.url).toBe(`${DISCORD_API_URL}/channels/222/messages`);
        expect(fake.calls[0]!.init.method).toBe('POST');
    });

    it('posts a thread message to the thread', async () => {
        const fake = fakeFetch();

        await sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:111:222:333', 
            text: 'hello', 
            key: 'k1',
        })(new AbortController().signal);

        expect(fake.calls[0]!.url).toBe(`${DISCORD_API_URL}/channels/333/messages`);
    });

    it('posts a DM to the DM channel', async () => {
        const fake = fakeFetch();

        await sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:@me:444', 
            text: 'hello', 
            key: 'k1',
        })(new AbortController().signal);

        expect(fake.calls[0]!.url).toBe(`${DISCORD_API_URL}/channels/444/messages`);
    });

    it('sends the exact body: no pings, a deterministic nonce, enforced', async () => {
        const fake = fakeFetch();
        const send = sender(fake.fetch);

        await send({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hi <@1> @everyone', 
            key: 'k1',
        })(new AbortController().signal);
        await send({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'again', 
            key: 'k1',
        })(new AbortController().signal);
        await send({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'other', 
            key: 'k2',
        })(new AbortController().signal);

        expect(bodyOf(fake.calls[0]!)).toEqual({
            content: 'hi <@1> @everyone',
            allowed_mentions: { parse: [] },
            nonce: nonceOf('discord', '222', 'k1'),
            enforce_nonce: true,
        });
        expect((bodyOf(fake.calls[0]!).nonce as string)).toHaveLength(25);
        expect(bodyOf(fake.calls[1]!).nonce).toBe(bodyOf(fake.calls[0]!).nonce);
        expect(bodyOf(fake.calls[2]!).nonce).not.toBe(bodyOf(fake.calls[0]!).nonce);
    });

    it('keys the nonce by the channel name', async () => {
        const fake = fakeFetch();
        const input = {
            threadId: 'discord:111:222', 
            text: 'x', 
            key: 'k1', 
        };

        await sender(fake.fetch)({ ...input, channel: 'discord' })(new AbortController().signal);
        await sender(fake.fetch)({ ...input, channel: 'discord-ops' })(new AbortController().signal);

        expect(bodyOf(fake.calls[0]!).nonce).not.toBe(bodyOf(fake.calls[1]!).nonce);
    });

    it('keys the nonce by the Discord target, so one key sent to two channels posts twice', async () => {
        const fake = fakeFetch();
        const send = sender(fake.fetch);

        await send({
            channel: 'discord',
            threadId: 'discord:111:222',
            text: 'digest',
            key: 'digest:2026-11-03',
        })(new AbortController().signal);
        await send({
            channel: 'discord',
            threadId: 'discord:111:555',
            text: 'digest',
            key: 'digest:2026-11-03',
        })(new AbortController().signal);
        await send({
            channel: 'discord',
            threadId: 'discord:111:222:333',
            text: 'digest',
            key: 'digest:2026-11-03',
        })(new AbortController().signal);

        const nonces = fake.calls.map((call) => bodyOf(call).nonce);

        expect(nonces[0]).toBe(nonceOf('discord', '222', 'digest:2026-11-03'));
        expect(nonces[1]).toBe(nonceOf('discord', '555', 'digest:2026-11-03'));
        expect(nonces[2]).toBe(nonceOf('discord', '333', 'digest:2026-11-03'));
        expect(new Set(nonces).size).toBe(3);
    });

    it('carries the token in the Authorization header only', async () => {
        const fake = fakeFetch();

        await sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        })(new AbortController().signal);

        const call = fake.calls[0]!;
        const headers = headersOf(call);

        expect(headers.get('authorization')).toBe(`Bot ${TOKEN}`);
        expect(headers.get('content-type')).toBe('application/json');
        expect(call.url).not.toContain(TOKEN);
        expect(String(call.init.body)).not.toContain(TOKEN);

        const others = headers.entries().toArray().filter(([name]) => name !== 'authorization');

        expect(JSON.stringify(others)).not.toContain(TOKEN);
    });

    it('reads the token per post', async () => {
        const fake = fakeFetch();
        let reads = 0;
        const send = sender(fake.fetch, async () => {
            reads++;

            return `${TOKEN}${reads}`;
        });
        const post = send({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        });

        expect(reads).toBe(0);
        await post(new AbortController().signal);
        expect(headersOf(fake.calls[0]!).get('authorization')).toBe(`Bot ${TOKEN}1`);
    });

    it('passes the signal: an abort cancels the request and the post rejects', async () => {
        const fake = hangingFetch();
        const controller = new AbortController();
        const post = sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        })(controller.signal);
        const reason = new Error('deadline');

        await new Promise((resolve) => {
            setImmediate(resolve); 
        });
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]!.init.signal).toBe(controller.signal);

        controller.abort(reason);

        await expect(post).rejects.toBe(reason);
    });

    it('sends nothing when the signal aborted before the post', async () => {
        const fake = fakeFetch();
        const controller = new AbortController();
        const reason = new Error('gone');

        controller.abort(reason);

        await expect(sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        })(controller.signal)).rejects.toBe(reason);
        expect(fake.calls).toHaveLength(0);
    });

    it('reports a 429 as chat_request with status and Discord code, never the token, no retry', async () => {
        const fake = fakeFetch(() => Response.json(
            {
                message: 'You are being rate limited.', 
                retry_after: 1.5, 
                global: false, 
                code: 0, 
            },
            { status: 429 },
        ));
        const error = await rejection(sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        })(new AbortController().signal));

        expect(error).toMatchObject({ code: CHAT_REQUEST_ERROR_CODE });
        expect((error as Error).message).toContain('429');
        expect((error as Error).message).toContain('code 0');
        expect((error as Error).message).not.toContain(TOKEN);
        expect(JSON.stringify(error)).not.toContain(TOKEN);
        expect(fake.calls).toHaveLength(1);
    });

    it('reports a 500 as chat_request with the body text cut to 200 characters', async () => {
        const fake = fakeFetch(() => new Response(`${'x'.repeat(300)}${TOKEN}`, { status: 500 }));
        const error = await rejection(sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        })(new AbortController().signal));

        expect(error).toMatchObject({ code: CHAT_REQUEST_ERROR_CODE });
        expect((error as Error).message).toContain('500');
        expect((error as Error).message).toContain('x'.repeat(200));
        expect((error as Error).message).not.toContain('x'.repeat(201));
        expect((error as Error).message).not.toContain(TOKEN);
        expect(fake.calls).toHaveLength(1);
    });

    it('names the Discord error code of a 4xx', async () => {
        const fake = fakeFetch(() => Response.json({ message: 'Missing Access', code: 50001 }, { status: 403 }));
        const error = await rejection(sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        })(new AbortController().signal));

        expect(error).toMatchObject({ code: CHAT_REQUEST_ERROR_CODE });
        expect((error as Error).message).toContain('403');
        expect((error as Error).message).toContain('code 50001');
        expect((error as Error).message).toContain('Missing Access');
    });

    it('fails a throwing token provider without its message and without fetching', async () => {
        const fake = fakeFetch();
        const error = await rejection(sender(fake.fetch, async () => {
            throw new Error(`bad ${TOKEN}`);
        })({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        })(new AbortController().signal));

        expect(error).toMatchObject({ code: CHAT_REQUEST_ERROR_CODE });
        expect((error as Error).message).not.toContain(TOKEN);
        expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
        expect(fake.calls).toHaveLength(0);
    });

    it('fails an empty token without fetching', async () => {
        const fake = fakeFetch();
        const error = await rejection(sender(fake.fetch, async () => '')({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        })(new AbortController().signal));

        expect(error).toMatchObject({ code: CHAT_REQUEST_ERROR_CODE });
        expect(fake.calls).toHaveLength(0);
    });

    it('fails a network error as chat_request without the token', async () => {
        const fake = fakeFetch(() => {
            throw new TypeError(`fetch failed for ${TOKEN}`);
        });
        const error = await rejection(sender(fake.fetch)({
            channel: 'discord', 
            threadId: 'discord:111:222', 
            text: 'hello', 
            key: 'k1',
        })(new AbortController().signal));

        expect(error).toMatchObject({ code: CHAT_REQUEST_ERROR_CODE });
        expect((error as Error).message).not.toContain(TOKEN);
    });

    it('refuses a non-Discord thread id when the post is built, before any fetch', () => {
        const fake = fakeFetch();
        const send = sender(fake.fetch);

        expect(() => send({
            channel: 'discord', 
            threadId: 'slack:C1:T1', 
            text: 'hello', 
            key: 'k1',
        })).toThrow();
        expect(() => send({
            channel: 'discord', 
            threadId: 'discord:111:../../users', 
            text: 'hello', 
            key: 'k1',
        })).toThrow();
        expect(() => send({
            channel: 'discord', 
            threadId: 'discord:111:', 
            text: 'hello', 
            key: 'k1',
        })).toThrow();
        expect(fake.calls).toHaveLength(0);
    });
});
