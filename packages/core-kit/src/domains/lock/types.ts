/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A lease on a key: the row a lock stores. */
export type Lock = {
    /** The row's storage id (a uuid); a takeover of the key keeps it. */
    id: string;
    /** The leased key, unique. */
    key: string;
    /** Who holds the lease. */
    owner: string;
    /** When the lease ends: from this time on it counts as expired. */
    expiresAt: Date;
    /**
     * The fencing token of the lease: from `ILockRepository.nextToken()`,
     * issued on every insert and takeover, kept by a renewal.
     */
    token: number;
};
