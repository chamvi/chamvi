/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EntityRecord } from '@chamvi/store';

/**
 * A field that holds the key of a row of another entity (a foreign key on
 * the referenced entity's single key field); a path joined by dots names
 * a field of a nested object.
 */
export type MemoryReference = {
    field: string;
    entity: string;
};

/**
 * What the registry knows of one entity: its key fields, its unique field
 * groups and the references it declares.
 */
export type MemoryEntityDefinition = {
    entity: string;
    key: string[];
    unique: string[][];
    references: MemoryReference[];
};

/**
 * One transaction of the registry: the writes it has not committed yet
 * (per entity and row key; `null` deletes the row), the locks it holds,
 * what a rollback undoes outside the rows, the storage error that aborted
 * it and whether it ended. The locks it waits for are the lines it stands
 * in, kept by the registry alone.
 */
export type MemoryTransaction = {
    id: number;
    writes: Map<string, Map<string, EntityRecord | null>>;
    held: Set<string>;
    undo: (() => void)[];
    aborted?: Error;
    ended?: boolean;
};
