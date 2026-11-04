/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The adapter's name: thread ids are `discord:<guild | @me>:<channel>[:<thread>]`. */
export const DISCORD_ADAPTER_NAME = 'discord';

/** The Discord REST base every send goes to unless `apiUrl` overrides it. */
export const DISCORD_API_URL = 'https://discord.com/api/v10';

/** Discord's bound on a message's content, in characters. */
export const DISCORD_TEXT_MAX_CHARS = 2000;

/**
 * Re-create the client after a transient login failure: attempt n (0-based)
 * waits `min(maxMs, initialMs * factor^n)`, scaled by a random factor in
 * `1 ± jitter` and capped at `maxMs`; after `maxAttempts` failed attempts in a
 * row (a ready resets the count) the connection stays failed.
 */
export const DISCORD_RECONNECT = Object.freeze({
    initialMs: 2000,
    factor: 1.8,
    maxMs: 30_000,
    jitter: 0.25,
    maxAttempts: 12,
});

/** The bound on destroying the client when the channel stops. */
export const DISCORD_SHUTDOWN_TIMEOUT_MS = 30_000;

/** The bot token was refused, empty, or its provider failed: nothing reconnects. */
export const DISCORD_AUTH_ERROR_CODE = 'discord_auth';

/** The connection gave up: disallowed intents, an invalidated session, or reconnects exhausted. */
export const DISCORD_CONNECTION_ERROR_CODE = 'discord_connection';

/** Messages of one conversation waiting for their hand-over at most; a later one is dropped and reported. */
export const DISCORD_HANDOVER_MAX_PENDING = 100;
