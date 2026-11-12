/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';

type CatalogCacheOptions = {
    clock: IClock;
    /** How long a loaded catalog is served before the next get() loads again. */
    maxAgeMs: number;
};

type CatalogCache = {
    /** The cached catalog while younger than maxAgeMs, or the load in flight; loads otherwise. */
    get(): Promise<unknown>;
    /**
     * Loads again, sharing a load in flight. With `stale`, the catalog the
     * caller found stale, a newer catalog that already arrived is returned
     * instead of loading once more.
     */
    refresh(stale?: unknown): Promise<unknown>;
};

/**
 * Holds authup's catalog in the process for at most `maxAgeMs` (on the
 * clock), so a policy edited in authup reaches chamvi. Concurrent callers
 * share one load; a failed load is forgotten, so the next caller loads again.
 */
export function createCatalogCache(load: () => Promise<unknown>, options: CatalogCacheOptions): CatalogCache {
    let current: Promise<unknown> | undefined;
    let pending = false;
    let value: unknown;
    let loadedAt = 0;

    const start = (): Promise<unknown> => {
        const promise = Promise.try(load);

        current = promise;
        pending = true;

        promise.then(
            (result) => {
                if (current !== promise) {
                    return;
                }

                pending = false;
                value = result;
                loadedAt = options.clock.now().getTime();
            },
            () => {
                if (current !== promise) {
                    return;
                }

                pending = false;
                current = undefined;
            },
        );

        return promise;
    };

    return {
        get: () => {
            if (current && (pending || options.clock.now().getTime() - loadedAt < options.maxAgeMs)) {
                return current;
            }

            return start();
        },
        refresh: (stale?: unknown) => {
            if (current && (pending || (typeof stale !== 'undefined' && value !== stale))) {
                return current;
            }

            return start();
        },
    };
}
