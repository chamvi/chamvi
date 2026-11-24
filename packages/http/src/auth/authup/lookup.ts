/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';

/**
 * A lookup of a non-empty string that concurrent logins share, so a failed
 * one is reported once, not per login. Nothing is kept once it settles: the
 * caller's function caches, and a later login after a failure looks up again.
 */
export function createSharedLookup(
    fn: () => Promise<string>,
    label: string,
    report: (error: unknown) => void,
): () => Promise<string> {
    let lookup: Promise<string> | undefined;

    return () => {
        if (!lookup) {
            const current = (async () => {
                try {
                    const value = await fn();

                    if (typeof value !== 'string' || value.length === 0) {
                        throw new InvalidAgentDefinitionError(`authup: ${label}() must resolve a non-empty ${label} id.`);
                    }

                    return value;
                } catch (error) {
                    report(error);

                    throw error;
                }
            })();
            const clear = () => {
                if (lookup === current) {
                    lookup = undefined;
                }
            };

            lookup = current;
            current.then(clear, clear);
        }

        return lookup;
    };
}
