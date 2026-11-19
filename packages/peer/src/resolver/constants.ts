/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A peer's default poll window: one read of a remote run per minute across replicas. */
export const PEER_POLL_DEFAULT_MS = 60_000;

/** The shortest poll window a peer may set (1 s). */
export const PEER_POLL_MIN_MS = 1_000;
