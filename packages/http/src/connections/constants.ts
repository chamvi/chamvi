/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A test failure's message is cut to this; a provider's error text can be long. */
export const TEST_MESSAGE_MAX_LENGTH = 500;

/** How long a connection test may take: its server may never answer, and an HTTP client may never go away. */
export const TEST_TIMEOUT_MS = 30_000;

export const NO_STORE_MESSAGE = 'This app stores no connections: its settings come from the environment or code.';
