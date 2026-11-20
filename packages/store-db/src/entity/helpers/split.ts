/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EntityRecord } from '@chamvi/store';

/** The bind parameters a where value takes: one per array item but `null` (`IS NULL`), one per other value. */
function bindCountOf(value: unknown): number {
    if (Array.isArray(value)) {
        return value.filter((item) => item !== null).length;
    }

    return value === null || value === undefined ? 0 : 1;
}

/** The chunks of an array of at most `size` values each; its `null` (`IS NULL`) only in the first. */
function chunksOf(items: unknown[], size: number): unknown[][] {
    const values = items.filter((item) => item !== null);
    const chunks: unknown[][] = [];

    for (let i = 0; i < values.length; i += size) {
        chunks.push(values.slice(i, i + size));
    }

    if (chunks.length === 0) {
        chunks.push([]);
    }

    if (values.length !== items.length) {
        chunks[0]!.push(null);
    }

    return chunks;
}

/**
 * Entity where values as parts that each bind at most `limit` parameters,
 * matching together the rows the whole where matches, each row in one
 * part only: every array is deduplicated, then the largest arrays are
 * split until the other predicates leave each split array at least one
 * value per statement, and the parts are the cartesian product of the
 * chunks (disjoint, as the chunks of an array are). `undefined` when the
 * scalars and one value per array already bind more than `limit`.
 */
export function splitWhereValues(values: EntityRecord, limit: number): EntityRecord[] | undefined {
    const distinct: EntityRecord = {};

    for (const [property, value] of Object.entries(values)) {
        distinct[property] = Array.isArray(value) ? Array.from(new Set(value)) : value;
    }

    const counts = new Map(Object.entries(distinct).map(([property, value]) => [property, bindCountOf(value)]));
    let rest = limit - Array.from(counts.values()).reduce((sum, count) => sum + count, 0);

    if (rest >= 0) {
        return [distinct];
    }

    const arrays = Object.keys(distinct)
        .filter((property) => Array.isArray(distinct[property]) && counts.get(property)! > 0)
        .sort((a, b) => counts.get(b)! - counts.get(a)!);
    const split: string[] = [];

    for (const property of arrays) {
        split.push(property);
        rest += counts.get(property)!;

        if (rest >= split.length) {
            break;
        }
    }

    // even one value per split array leaves a statement above the limit
    if (rest < split.length) {
        return undefined;
    }

    // the smallest split array first: each takes what it holds, at most an even share of what is left
    const parts: EntityRecord[][] = [];
    let left = rest;

    split.reverse();

    for (const [index, property] of split.entries()) {
        const size = Math.max(1, Math.min(counts.get(property)!, Math.floor(left / (split.length - index))));

        left -= size;
        parts.push(chunksOf(distinct[property] as unknown[], size).map((chunk) => ({ [property]: chunk })));
    }

    return parts.reduce(
        (wheres, chunks) => wheres.flatMap((where) => chunks.map((chunk) => ({ ...where, ...chunk }))),
        [distinct],
    );
}
