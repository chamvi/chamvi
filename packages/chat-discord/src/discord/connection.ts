/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    DiscordjsErrorCodes,
    Events,
    GatewayCloseCodes,
    GatewayIntentBits,
    Partials,
} from 'discord.js';
import type { ClientOptions } from 'discord.js';
import { ChamviError, InvalidRunStateError } from '@chamvi/core';
import type { IClock } from '@chamvi/core';
import { isObject } from 'smob';
import {
    DISCORD_AUTH_ERROR_CODE,
    DISCORD_CONNECTION_ERROR_CODE,
    DISCORD_RECONNECT,
    DISCORD_SHUTDOWN_TIMEOUT_MS,
} from './constants.ts';
import type {
    DiscordClient,
    DiscordConnection,
    DiscordConnectionOptions,
    DiscordConnectionStatus,
    DiscordInboundMessage,
} from './types.ts';

/** One connect: the clients it makes, its retry state, its close. */
type Generation = {
    readonly clock: IClock;
    /** close began: no client, no retry from here on */
    closed: boolean;
    /** a terminal failure was reported: no retry, no status but `failed` */
    failed: boolean;
    client?: DiscordClient;
    detach?: () => void;
    timer?: { clear(): void };
    /** failed login attempts in a row */
    failures: number;
    /** the close code of the current client's last shard disconnect */
    lastClose?: number;
    unlisten?: () => void;
    closing?: Promise<void>;
};

/** Exactly what chamvi reads: guild and DM messages with their content; no reactions, no members. */
const CLIENT_OPTIONS: ClientOptions = Object.freeze({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    // DM channels arrive uncached
    partials: [Partials.Channel],
}) as ClientOptions;

const INTENTS_HINT = 'Discord refused the Gateway intents: enable the Message Content intent for the bot in the Developer Portal (Bot, Privileged Gateway Intents); nothing reconnects.';

const AUTH_REFUSED = 'Discord refused the bot token; nothing reconnects.';

/** Close codes discord.js does not recover from (besides 4004 and 4014, which get their own message). */
const TERMINAL_CLOSES: ReadonlySet<number> = new Set([
    GatewayCloseCodes.InvalidShard,
    GatewayCloseCodes.ShardingRequired,
    GatewayCloseCodes.InvalidAPIVersion,
    GatewayCloseCodes.InvalidIntents,
]);

type Terminal = { code: string; message: string };

function failure(code: string, message: string, cause?: unknown): ChamviError {
    return new ChamviError({
        code,
        message,
        ...(cause !== undefined ? { cause } : {}),
    });
}

/** The verdict for a close code: undefined when discord.js reconnects by itself. */
function terminalOfClose(code: number | undefined): Terminal | undefined {
    if (code === GatewayCloseCodes.AuthenticationFailed) {
        return { code: DISCORD_AUTH_ERROR_CODE, message: AUTH_REFUSED };
    }

    if (code === GatewayCloseCodes.DisallowedIntents) {
        return { code: DISCORD_CONNECTION_ERROR_CODE, message: INTENTS_HINT };
    }

    if (code !== undefined && TERMINAL_CLOSES.has(code)) {
        return {
            code: DISCORD_CONNECTION_ERROR_CODE,
            message: `The Discord Gateway closed with code ${code}, which does not recover; nothing reconnects.`,
        };
    }

    return undefined;
}

/**
 * The verdict for a login rejection: discord.js rejects an unrecoverable
 * close with a plain Error, so its message and the close seen before it decide.
 */
function terminalOfLogin(error: unknown, lastClose: number | undefined): Terminal | undefined {
    const code = isObject(error) ? error.code : undefined;
    const message = Error.isError(error) ? error.message : '';

    if (code === DiscordjsErrorCodes.TokenInvalid || code === DiscordjsErrorCodes.TokenMissing || message === 'Authentication failed') {
        return { code: DISCORD_AUTH_ERROR_CODE, message: AUTH_REFUSED };
    }

    if (code === 'DisallowedIntents' || message === 'Used disallowed intents') {
        return { code: DISCORD_CONNECTION_ERROR_CODE, message: INTENTS_HINT };
    }

    return terminalOfClose(lastClose);
}

/** The close code of a shard disconnect event, if any. */
function closeCodeOf(event: unknown): number | undefined {
    return isObject(event) && typeof event.code === 'number' ? event.code : undefined;
}

/** The wait before retry `n` (0-based), see DISCORD_RECONNECT. */
function backoff(n: number): number {
    const base = Math.min(DISCORD_RECONNECT.maxMs, DISCORD_RECONNECT.initialMs * DISCORD_RECONNECT.factor ** n);
    const scaled = base * (1 + DISCORD_RECONNECT.jitter * (2 * Math.random() - 1));

    return Math.max(1, Math.min(DISCORD_RECONNECT.maxMs, Math.round(scaled)));
}

/** `promise`, or the signal's reason once it aborts first. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);

        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener('abort', onAbort);
                reject(error);
            },
        );
    });
}

/** Whether `work` settled within `ms` on the clock; its rejection rethrown. */
async function within(clock: IClock, ms: number, work: Promise<void>): Promise<boolean> {
    let timer: { clear(): void } | undefined;
    const timeout = new Promise<false>((resolve) => {
        timer = clock.setTimeout(() => resolve(false), ms);
    });

    try {
        return await Promise.race([work.then(() => true as const), timeout]);
    } finally {
        timer?.clear();
    }
}

/** destroy(), as a promise even when it throws synchronously */
function destroyOf(client: DiscordClient): Promise<void> {
    return (async () => {
        await client.destroy();
    })();
}

/**
 * The Discord Gateway connection: `connect` reads the token and starts one
 * discord.js client's login; client and shard events alone set the status,
 * and discord.js resumes and reconnects by itself. Only a transient login
 * failure makes a new client, with backoff on the clock (the token read
 * again). An invalid or empty token, a failing token provider, disallowed
 * intents, an invalidated session or exhausted retries end in `failed`,
 * reported once. `close` (idempotent per connect, also run by the connect's
 * abort) stops the retry, detaches every listener and destroys the client
 * within DISCORD_SHUTDOWN_TIMEOUT_MS (30 s). No error carries the token or a
 * token provider's own error.
 */
export function createDiscordConnection(options: DiscordConnectionOptions): DiscordConnection {
    let current: Generation | undefined;
    let status: DiscordConnectionStatus = 'stopped';

    const report = (error: unknown) => {
        try {
            options.onError(error);
        } catch {
            // a throwing onError must not break the connection's bookkeeping
        }
    };

    const isCurrent = (generation: Generation, client?: DiscordClient) => current === generation &&
        !generation.closed &&
        (client === undefined || generation.client === client);

    const setStatus = (generation: Generation, next: DiscordConnectionStatus) => {
        if (current === generation && (!generation.failed || next === 'stopped')) {
            status = next;
        }
    };

    /** detaches the generation's client and destroys it; the destroy's promise, if there was a client */
    const dropClient = (generation: Generation): Promise<void> | undefined => {
        const { client } = generation;

        generation.detach?.();
        delete generation.detach;
        delete generation.client;
        delete generation.lastClose;

        return client ? destroyOf(client) : undefined;
    };

    /** a client given up while the connection lives on: destroyed in the background */
    const retireClient = (generation: Generation) => {
        dropClient(generation)?.catch((error: unknown) => {
            report(failure(DISCORD_CONNECTION_ERROR_CODE, 'Destroying the Discord client failed.', error));
        });
    };

    const fail = (generation: Generation, terminal: Terminal, cause?: unknown) => {
        if (generation.failed || !isCurrent(generation)) {
            return;
        }

        setStatus(generation, 'failed');
        generation.failed = true;
        generation.timer?.clear();
        delete generation.timer;
        retireClient(generation);
        report(failure(terminal.code, terminal.message, cause));
    };

    const failAuth = (generation: Generation, message: string) => {
        // never a cause: a token provider's error or a refused login could carry the token
        fail(generation, { code: DISCORD_AUTH_ERROR_CODE, message });
    };

    /** the token, never thrown synchronously */
    const readToken = (): Promise<string> => (async () => options.token())();

    let scheduleRetry: (generation: Generation) => void = () => undefined;

    const onLoginRejected = (generation: Generation, client: DiscordClient, error: unknown) => {
        if (!isCurrent(generation, client) || generation.failed) {
            return;
        }

        const terminal = terminalOfLogin(error, generation.lastClose);

        if (terminal) {
            fail(generation, terminal);

            return;
        }

        retireClient(generation);
        setStatus(generation, 'disconnected');
        scheduleRetry(generation);
    };

    const createClient = (generation: Generation, token: string) => {
        if (typeof token !== 'string' || token.length === 0) {
            failAuth(generation, 'The Discord bot token is empty; nothing connects.');

            return;
        }

        const client = options.clientFactory({ ...CLIENT_OPTIONS });

        const onReady = () => {
            if (!isCurrent(generation, client)) {
                return;
            }

            generation.failures = 0;
            setStatus(generation, 'connected');
        };

        const onReconnecting = () => {
            if (isCurrent(generation, client)) {
                setStatus(generation, 'connecting');
            }
        };

        const onDisconnect = (event: unknown) => {
            if (!isCurrent(generation, client)) {
                return;
            }

            const code = closeCodeOf(event);

            generation.lastClose = code;

            const terminal = terminalOfClose(code);

            if (terminal) {
                fail(generation, terminal);

                return;
            }

            setStatus(generation, 'disconnected');
        };

        const onInvalidated = () => {
            if (isCurrent(generation, client)) {
                fail(generation, {
                    code: DISCORD_CONNECTION_ERROR_CODE,
                    message: 'Discord invalidated the Gateway session; nothing reconnects (restart the channel).',
                });
            }
        };

        const onClientError = (error: unknown) => {
            if (isCurrent(generation, client)) {
                report(failure(DISCORD_CONNECTION_ERROR_CODE, 'The Discord client reported an error.', error));
            }
        };

        const onMessage = (message: DiscordInboundMessage) => {
            if (!isCurrent(generation, client) || !client.user) {
                return;
            }

            try {
                options.onMessage(message, client.user.id);
            } catch (error) {
                report(error);
            }
        };

        const listeners: [string, (...args: any[]) => void][] = [
            [Events.ClientReady, onReady],
            [Events.ShardReady, onReady],
            [Events.ShardResume, onReady],
            [Events.ShardReconnecting, onReconnecting],
            [Events.ShardDisconnect, onDisconnect],
            [Events.Invalidated, onInvalidated],
            [Events.Error, onClientError],
            [Events.MessageCreate, onMessage],
        ];

        for (const [event, listener] of listeners) {
            client.on(event, listener);
        }

        generation.client = client;
        generation.detach = () => {
            for (const [event, listener] of listeners) {
                client.off(event, listener);
            }
        };

        let login: Promise<string>;

        try {
            login = client.login(token);
        } catch (error) {
            login = Promise.reject(error);
        }

        login.then(
            () => {
                // a destroy that landed mid-login (before discord.js spawned its shards)
                // leaves the late session online: a stale or failed generation destroys again
                if (!isCurrent(generation, client) || generation.failed) {
                    destroyOf(client).catch(() => undefined);
                }
            },
            (error: unknown) => onLoginRejected(generation, client, error),
        );
    };

    scheduleRetry = (generation: Generation) => {
        if (generation.failures >= DISCORD_RECONNECT.maxAttempts) {
            fail(generation, {
                code: DISCORD_CONNECTION_ERROR_CODE,
                message: `Discord did not connect after ${DISCORD_RECONNECT.maxAttempts} retries; restart the channel to try again.`,
            });

            return;
        }

        const delay = backoff(generation.failures);

        generation.failures += 1;
        generation.timer = generation.clock.setTimeout(() => {
            delete generation.timer;

            if (!isCurrent(generation) || generation.failed) {
                return;
            }

            setStatus(generation, 'connecting');
            readToken().then(
                (token) => {
                    if (!isCurrent(generation) || generation.failed) {
                        return;
                    }

                    try {
                        createClient(generation, token);
                    } catch (error) {
                        report(failure(DISCORD_CONNECTION_ERROR_CODE, 'Creating the Discord client failed.', error));
                        retireClient(generation);
                        setStatus(generation, 'disconnected');
                        scheduleRetry(generation);
                    }
                },
                () => {
                    if (isCurrent(generation)) {
                        failAuth(generation, 'The Discord bot token provider failed; nothing reconnects.');
                    }
                },
            );
        }, delay);
    };

    const closeGeneration = async (generation: Generation): Promise<void> => {
        generation.closed = true;
        generation.timer?.clear();
        delete generation.timer;
        generation.unlisten?.();
        delete generation.unlisten;
        setStatus(generation, 'stopped');

        const destroying = dropClient(generation);

        if (!destroying) {
            return;
        }

        try {
            if (!await within(generation.clock, DISCORD_SHUTDOWN_TIMEOUT_MS, destroying)) {
                destroying.catch(() => undefined);
                report(failure(DISCORD_CONNECTION_ERROR_CODE, `Destroying the Discord client did not finish within ${DISCORD_SHUTDOWN_TIMEOUT_MS}ms.`));
            }
        } catch (error) {
            report(failure(DISCORD_CONNECTION_ERROR_CODE, 'Destroying the Discord client failed.', error));
        }
    };

    const closeOf = (generation: Generation): Promise<void> => {
        generation.closing ??= closeGeneration(generation);

        return generation.closing;
    };

    const connect = async ({ signal, clock }: { signal: AbortSignal; clock: IClock }): Promise<void> => {
        if (current && !current.closed) {
            throw new InvalidRunStateError('The Discord connection is already connected.');
        }

        await current?.closing;
        // an aborted connect never becomes the current generation
        signal.throwIfAborted();

        const generation: Generation = {
            clock,
            closed: false,
            failed: false,
            failures: 0,
        };

        current = generation;
        status = 'connecting';

        // an abort (a stop during the start, or later) closes this generation
        const onAbort = () => {
            closeOf(generation).catch(() => undefined);
        };

        signal.addEventListener('abort', onAbort, { once: true });
        generation.unlisten = () => signal.removeEventListener('abort', onAbort);

        let token: string;

        try {
            token = await untilAborted(readToken(), signal);
        } catch {
            if (signal.aborted) {
                throw signal.reason;
            }

            failAuth(generation, 'The Discord bot token provider failed; nothing connects.');

            return;
        }

        if (generation.closed) {
            throw signal.aborted ? signal.reason : new InvalidRunStateError('The Discord connection closed while it connected.');
        }

        createClient(generation, token);
    };

    return {
        status: () => status,
        connect,
        close() {
            return current ? closeOf(current) : Promise.resolve();
        },
    };
}
