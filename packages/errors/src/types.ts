/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ErrorOptions } from '@ebec/core';

export type ChamviErrorOptions = ErrorOptions & {
    data?: Record<string, any>,
};

export type ChamviErrorInput = string | ChamviErrorOptions;

export type ChamviEntityErrorOptions = ChamviErrorOptions & {
    /** The entity's label (`run`, `step`), never an id or a value. */
    entity?: string,
};

/** A message, or the options of an entity error (`T`: the options of a class with extra fields). */
export type ChamviEntityErrorInput<T extends ChamviEntityErrorOptions = ChamviEntityErrorOptions> = string | T;

export type ChamviEntityRelationErrorOptions = ChamviEntityErrorOptions & {
    /** The label of the referenced entity, never its id. */
    relation?: string,
};

export type ChamviEntityInvalidErrorOptions = ChamviEntityErrorOptions & {
    /** The repository operation that was refused, e.g. `save`. */
    operation?: string,
    /** The column or constraint the storage named, if it named one. */
    field?: string,
};
