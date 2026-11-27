/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A recorded effect result: the row an effect key stores. */
export type EffectRecord = {
    /** The row's storage id (a uuid), kept by every later `upsert` of the same `key`. */
    id: string;
    key: string;
    result: unknown;
};
