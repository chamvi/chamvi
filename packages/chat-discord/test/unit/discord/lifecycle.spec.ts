/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Client,
    Events,
    GatewayIntentBits,
    Partials,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { InvalidRunStateError } from '@chamvi/core';
import {
    DISCORD_AUTH_ERROR_CODE,
    DISCORD_CONNECTION_ERROR_CODE,
    DISCORD_RECONNECT,
    DISCORD_SHUTDOWN_TIMEOUT_MS,
} from '@chamvi/chat-discord';
import { ControllableClock } from '@chamvi/test-kit';
import { createDiscordConnection } from '../../../src/discord/connection.ts';
import type {
    DiscordClientFactory,
    DiscordConnection,
    DiscordInboundMessage,
} from '../../../src/discord/types.ts';
import {
    BOT,
    createFakeClients,
    discordMessage,
    settle,
} from '../../utils/discord.ts';
import type { FakeClients } from '../../utils/discord.ts';

const TOKEN = 'MTAwMDAw.sentinel-bot-token.SECRET';

type Fixture = {
    connection: DiscordConnection;
    clients: FakeClients;
    clock: ControllableClock;
    controller: AbortController;
    errors: unknown[];
    messages: { message: DiscordInboundMessage; botId: string }[];
    tokenReads: () => number;
    connect: () => Promise<void>;
};

function fixture(input: { token?: () => Promise<string> } = {}): Fixture {
    const clients = createFakeClients();
    const clock = new ControllableClock();
    const controller = new AbortController();
    const errors: unknown[] = [];
    const messages: { message: DiscordInboundMessage; botId: string }[] = [];
    let reads = 0;
    const token = input.token ?? (async () => TOKEN);
    const connection = createDiscordConnection({
        token: () => {
            reads += 1;

            return token();
        },
        clientFactory: clients.factory,
        onMessage: (message, botId) => {
            messages.push({ message, botId });
        },
        onError: (error) => {
            errors.push(error);
        },
    });

    return {
        connection,
        clients,
        clock,
        controller,
        errors,
        messages,
        tokenReads: () => reads,
        connect: () => connection.connect({ signal: controller.signal, clock }),
    };
}

function codesOf(errors: unknown[]): unknown[] {
    return errors.map((error) => (error as { code?: unknown }).code);
}

/** everything an error could show: its message, code and causes, serialized */
function textOf(error: unknown): string {
    const parts: string[] = [];
    let current: unknown = error;

    for (let depth = 0; current !== undefined && current !== null && depth < 8; depth++) {
        parts.push(String(current));

        if (Error.isError(current)) {
            parts.push(current.message, current.stack ?? '', JSON.stringify(current));
            current = current.cause;
        } else {
            parts.push(JSON.stringify(current));
            current = undefined;
        }
    }

    return parts.join('\n');
}

/** the longest a reconnect may wait before attempt `n` (0-based): the base with the jitter on top, capped */
function upperDelay(n: number): number {
    const base = Math.min(DISCORD_RECONNECT.maxMs, DISCORD_RECONNECT.initialMs * DISCORD_RECONNECT.factor ** n);

    return Math.ceil(Math.min(DISCORD_RECONNECT.maxMs, base * (1 + DISCORD_RECONNECT.jitter)));
}

function lowerDelay(n: number): number {
    const base = Math.min(DISCORD_RECONNECT.maxMs, DISCORD_RECONNECT.initialMs * DISCORD_RECONNECT.factor ** n);

    return Math.floor(base * (1 - DISCORD_RECONNECT.jitter));
}

function codedError(code: string, message: string): Error {
    return Object.assign(new Error(message), { code });
}

describe('Discord Gateway connection lifecycle', () => {
    it('pins the reconnect and shutdown values', () => {
        expect(DISCORD_RECONNECT).toEqual({
            initialMs: 2000,
            factor: 1.8,
            maxMs: 30_000,
            jitter: 0.25,
            maxAttempts: 12,
        });
        expect(DISCORD_SHUTDOWN_TIMEOUT_MS).toBe(30_000);
    });

    it('takes a discord.js Client as the factory result', () => {
        const factory: DiscordClientFactory = (options) => new Client(options);

        expect(typeof factory).toBe('function');
    });

    it('makes no client and reads no token before connect', () => {
        const {
            connection, 
            clients, 
            tokenReads, 
        } = fixture();

        expect(clients.clients).toEqual([]);
        expect(tokenReads()).toBe(0);
        expect(connection.status()).toBe('stopped');
    });

    it('builds one client with exactly the four intents and the channel partial, then logs in', async () => {
        const {
            connection, 
            clients, 
            connect, 
        } = fixture();

        await connect();

        expect(clients.clients).toHaveLength(1);

        const client = clients.last();

        expect(client.options.intents).toEqual([
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages,
        ]);
        expect(client.options.partials).toEqual([Partials.Channel]);
        expect(client.logins).toEqual([TOKEN]);
        // a login started is no connection
        expect(connection.status()).toBe('connecting');
    });

    it('follows the client and shard events', async () => {
        const {
            connection, 
            clients, 
            connect, 
        } = fixture();

        await connect();

        const client = clients.last();

        client.emit(Events.ClientReady, client);
        expect(connection.status()).toBe('connected');

        client.emit(Events.ShardDisconnect, { code: 1006 }, 0);
        expect(connection.status()).toBe('disconnected');

        client.emit(Events.ShardReconnecting, 0);
        expect(connection.status()).toBe('connecting');

        client.emit(Events.ShardResume, 0, 3);
        expect(connection.status()).toBe('connected');

        client.emit(Events.ShardReconnecting, 0);
        client.emit(Events.ShardReady, 0, undefined);
        expect(connection.status()).toBe('connected');

        // discord.js reconnects by itself: chamvi made no second client
        expect(clients.clients).toHaveLength(1);
    });

    it('rejects a second connect while connected', async () => {
        const { clients, connect } = fixture();

        await connect();

        await expect(connect()).rejects.toBeInstanceOf(InvalidRunStateError);
        expect(clients.clients).toHaveLength(1);
    });

    it('connects again after a close with a new client', async () => {
        const {
            connection, 
            clients, 
            clock, 
        } = fixture();

        await connection.connect({ signal: new AbortController().signal, clock });
        await connection.close();
        await connection.connect({ signal: new AbortController().signal, clock });

        expect(clients.clients).toHaveLength(2);
        expect(connection.status()).toBe('connecting');
    });

    it('forwards messages of the current client with the bot id', async () => {
        const {
            clients, 
            messages, 
            connect, 
        } = fixture();

        await connect();

        const client = clients.last();
        const message = discordMessage();

        client.emit(Events.ClientReady, client);
        client.emit(Events.MessageCreate, message);

        expect(messages).toEqual([{ message, botId: BOT }]);
    });

    it('retries a transient login failure on the clock with backoff, re-reading the token', async () => {
        const {
            connection,
            clients,
            clock,
            errors,
            tokenReads,
            connect,
        } = fixture();

        await connect();
        clients.last().rejectLogin(new Error('getaddrinfo ENOTFOUND discord.com'));
        await settle();

        expect(clients.last().destroyed).toBe(1);
        expect(connection.status()).toBe('disconnected');

        clock.advance(lowerDelay(0) - 1);
        await settle();
        expect(clients.clients).toHaveLength(1);

        clock.advance(upperDelay(0) - lowerDelay(0) + 1);
        await settle();
        expect(clients.clients).toHaveLength(2);
        expect(tokenReads()).toBe(2);
        expect(connection.status()).toBe('connecting');

        // the second wait is longer
        clients.last().rejectLogin(new Error('socket hang up'));
        await settle();
        clock.advance(lowerDelay(1) - 1);
        await settle();
        expect(clients.clients).toHaveLength(2);

        clock.advance(upperDelay(1) - lowerDelay(1) + 1);
        await settle();
        expect(clients.clients).toHaveLength(3);

        clients.last().emit(Events.ClientReady, clients.last());
        expect(connection.status()).toBe('connected');
        // transient failures are not reported while retries remain
        expect(errors).toEqual([]);
    });

    it('gives up after maxAttempts transient failures with discord_connection', async () => {
        const {
            connection,
            clients,
            clock,
            errors,
            connect,
        } = fixture();

        await connect();

        for (let attempt = 0; attempt < DISCORD_RECONNECT.maxAttempts; attempt++) {
            clients.last().rejectLogin(new Error('connect ECONNREFUSED'));
            await settle();
            clock.advance(DISCORD_RECONNECT.maxMs);
            await settle();
        }

        expect(clients.clients).toHaveLength(DISCORD_RECONNECT.maxAttempts + 1);

        clients.last().rejectLogin(new Error('connect ECONNREFUSED'));
        await settle();

        expect(connection.status()).toBe('failed');
        expect(codesOf(errors)).toEqual([DISCORD_CONNECTION_ERROR_CODE]);

        clock.advance(10 * DISCORD_RECONNECT.maxMs);
        await settle();
        expect(clients.clients).toHaveLength(DISCORD_RECONNECT.maxAttempts + 1);
    });

    it('stops on an invalid token with discord_auth and never retries', async () => {
        const {
            connection,
            clients,
            clock,
            errors,
            connect,
        } = fixture();

        await connect();
        clients.last().rejectLogin(codedError('TokenInvalid', 'An invalid token was provided.'));
        await settle();

        expect(connection.status()).toBe('failed');
        expect(codesOf(errors)).toEqual([DISCORD_AUTH_ERROR_CODE]);

        clock.advance(10 * DISCORD_RECONNECT.maxMs);
        await settle();
        expect(clients.clients).toHaveLength(1);
    });

    it('stops on an empty token with discord_auth and makes no client', async () => {
        const {
            connection,
            clients,
            clock,
            errors,
            connect,
        } = fixture({ token: async () => '' });

        await connect();
        await settle();

        expect(connection.status()).toBe('failed');
        expect(codesOf(errors)).toEqual([DISCORD_AUTH_ERROR_CODE]);

        clock.advance(10 * DISCORD_RECONNECT.maxMs);
        await settle();
        expect(clients.clients).toEqual([]);
    });

    it('reports a throwing token provider as discord_auth without its text', async () => {
        const {
            connection,
            clients,
            clock,
            errors,
            connect,
        } = fixture({
            token: async () => {
                throw new Error(`vault refused ${TOKEN}`);
            },
        });

        await connect();
        await settle();

        expect(connection.status()).toBe('failed');
        expect(codesOf(errors)).toEqual([DISCORD_AUTH_ERROR_CODE]);
        expect(textOf(errors[0])).not.toContain(TOKEN);
        expect(textOf(errors[0])).not.toContain('vault refused');

        clock.advance(10 * DISCORD_RECONNECT.maxMs);
        await settle();
        expect(clients.clients).toEqual([]);
        expect(errors).toHaveLength(1);
    });

    it('reports a token provider failing on a retry as discord_auth and stops', async () => {
        let reads = 0;
        const {
            connection,
            clients,
            clock,
            errors,
            connect,
        } = fixture({
            token: async () => {
                reads += 1;

                if (reads > 1) {
                    throw new Error(`expired ${TOKEN}`);
                }

                return TOKEN;
            },
        });

        await connect();
        clients.last().rejectLogin(new Error('socket hang up'));
        await settle();
        clock.advance(DISCORD_RECONNECT.maxMs);
        await settle();

        expect(connection.status()).toBe('failed');
        expect(codesOf(errors)).toEqual([DISCORD_AUTH_ERROR_CODE]);
        expect(errors.map(textOf).join('\n')).not.toContain(TOKEN);
        expect(clients.clients).toHaveLength(1);
    });

    it('stops on disallowed intents with discord_connection and the Message Content hint', async () => {
        const {
            connection,
            clients,
            clock,
            errors,
            connect,
        } = fixture();

        await connect();

        const client = clients.last();

        // discord.js: the shard closes with 4014, then login rejects
        client.emit(Events.ShardDisconnect, { code: 4014 }, 0);
        client.rejectLogin(new Error('Used disallowed intents'));
        await settle();

        expect(connection.status()).toBe('failed');
        expect(codesOf(errors)).toEqual([DISCORD_CONNECTION_ERROR_CODE]);
        expect((errors[0] as Error).message).toContain('Message Content');

        clock.advance(10 * DISCORD_RECONNECT.maxMs);
        await settle();
        expect(clients.clients).toHaveLength(1);
    });

    it('recognizes disallowed intents from the login rejection alone', async () => {
        const {
            connection,
            clients,
            errors,
            connect,
        } = fixture();

        await connect();
        clients.last().rejectLogin(new Error('Used disallowed intents'));
        await settle();

        expect(connection.status()).toBe('failed');
        expect(codesOf(errors)).toEqual([DISCORD_CONNECTION_ERROR_CODE]);
        expect((errors[0] as Error).message).toContain('Message Content');
    });

    it('fails on a terminal close after ready', async () => {
        const {
            connection,
            clients,
            clock,
            errors,
            connect,
        } = fixture();

        await connect();

        const client = clients.last();

        client.emit(Events.ClientReady, client);
        client.resolveLogin();
        await settle();
        client.emit(Events.ShardDisconnect, { code: 4004 }, 0);

        expect(connection.status()).toBe('failed');
        expect(codesOf(errors)).toEqual([DISCORD_AUTH_ERROR_CODE]);

        clock.advance(10 * DISCORD_RECONNECT.maxMs);
        await settle();
        expect(clients.clients).toHaveLength(1);
    });

    it('fails on an invalidated session with discord_connection', async () => {
        const {
            connection,
            clients,
            errors,
            connect,
        } = fixture();

        await connect();

        const client = clients.last();

        client.emit(Events.ClientReady, client);
        client.emit(Events.Invalidated);

        expect(connection.status()).toBe('failed');
        expect(codesOf(errors)).toEqual([DISCORD_CONNECTION_ERROR_CODE]);
    });

    it('reports a client error event without failing the connection', async () => {
        const {
            connection,
            clients,
            errors,
            connect,
        } = fixture();

        await connect();

        const client = clients.last();

        client.emit(Events.ClientReady, client);
        client.emit(Events.Error, new Error('websocket error'));

        expect(codesOf(errors)).toEqual([DISCORD_CONNECTION_ERROR_CODE]);
        expect(connection.status()).toBe('connected');
    });

    it('settles an abort during a hanging token read without a client', async () => {
        const pending = Promise.withResolvers<string>();
        const fx = fixture({ token: () => pending.promise });
        const connecting = fx.connect();

        fx.controller.abort(new Error('stop'));
        await expect(connecting).rejects.toThrow('stop');

        pending.resolve(TOKEN);
        await settle();

        expect(fx.clients.clients).toEqual([]);
        expect(fx.connection.status()).toBe('stopped');
    });

    it('destroys the client on an abort during a hanging login; a late login never connects', async () => {
        const {
            connection,
            clients,
            controller,
            messages,
            connect,
        } = fixture();

        await connect();

        const client = clients.last();

        controller.abort(new Error('stop'));
        await settle();

        expect(client.destroyed).toBe(1);
        expect(connection.status()).toBe('stopped');

        client.resolveLogin();
        client.emit(Events.ClientReady, client);
        client.emit(Events.MessageCreate, discordMessage());
        await settle();

        expect(connection.status()).toBe('stopped');
        expect(messages).toEqual([]);
    });

    it('closes during a pending login: destroyed, a late login never connects', async () => {
        const {
            connection,
            clients,
            clock,
            connect,
        } = fixture();

        await connect();

        const client = clients.last();

        await connection.close();

        expect(client.destroyed).toBe(1);
        expect(client.listenerCount()).toBe(0);

        client.resolveLogin();
        await settle();
        expect(connection.status()).toBe('stopped');

        clock.advance(10 * DISCORD_RECONNECT.maxMs);
        await settle();
        expect(clients.clients).toHaveLength(1);
    });

    it('closes after ready: destroyed once, stopped, no new client, no message forwarded', async () => {
        const {
            connection,
            clients,
            clock,
            messages,
            connect,
        } = fixture();

        await connect();

        const client = clients.last();

        client.emit(Events.ClientReady, client);
        await connection.close();
        await connection.close();

        expect(client.destroyed).toBe(1);
        expect(connection.status()).toBe('stopped');

        client.emit(Events.MessageCreate, discordMessage());
        client.emit(Events.ShardDisconnect, { code: 1006 }, 0);
        clock.advance(10 * DISCORD_RECONNECT.maxMs);
        await settle();

        expect(messages).toEqual([]);
        expect(clients.clients).toHaveLength(1);
        expect(connection.status()).toBe('stopped');
    });

    it('closes while a retry waits: no client after it', async () => {
        const {
            connection,
            clients,
            clock,
            connect,
        } = fixture();

        await connect();
        clients.last().rejectLogin(new Error('socket hang up'));
        await settle();

        await connection.close();
        clock.advance(10 * DISCORD_RECONNECT.maxMs);
        await settle();

        expect(clients.clients).toHaveLength(1);
        expect(connection.status()).toBe('stopped');
    });

    it('bounds a hanging destroy at the shutdown timeout', async () => {
        const {
            connection,
            clients,
            clock,
            errors,
            connect,
        } = fixture();

        clients.destroyHangs = true;
        await connect();

        let closed = false;
        const closing = connection.close().then(() => {
            closed = true;
        });

        await settle();
        clock.advance(DISCORD_SHUTDOWN_TIMEOUT_MS - 1);
        await settle();
        expect(closed).toBe(false);

        clock.advance(1);
        await closing;

        expect(closed).toBe(true);
        expect(connection.status()).toBe('stopped');
        expect(codesOf(errors)).toEqual([DISCORD_CONNECTION_ERROR_CODE]);
        expect(errors.map(textOf).join('\n')).not.toContain(TOKEN);
    });
});
