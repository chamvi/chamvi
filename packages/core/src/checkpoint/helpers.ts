/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Checkpoint, CheckpointRecord } from '@chamvi/store';

/** A stored checkpoint as the service returns it: no storage id, a property set to `undefined` left out. */
export function readCheckpoint(record: CheckpointRecord): Checkpoint {
    const output: Partial<CheckpointRecord> = { ...record };

    delete output.id;

    for (const key of Object.keys(output) as (keyof Checkpoint)[]) {
        if (output[key] === undefined) {
            delete output[key];
        }
    }

    return output as Checkpoint;
}
