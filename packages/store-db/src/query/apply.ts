/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IQuery } from '@rapiq/core';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { loadTypeormAdapter } from '../entity/helpers/adapter.ts';
import { prepareQuery } from '../entity/helpers/query.ts';
import type { ApplyQueryOptions, ApplyQueryResult } from './types.ts';

/**
 * Applies a rapiq query to a TypeORM select query builder, the one way a
 * query reaches a database (the repository base's `findMany` runs it
 * too): fields, filters and sorts renamed through `options.fields`, a
 * filter value that is no uuid on a uuid column dropped before the driver
 * sees it (it matches no row), a value on a date-time column that names
 * no instant refused (`EntityQueryError`), string matching case-sensitive, relations
 * joined, the page set. It allows what the query holds: decode a client's
 * query against a list schema first (`decodeQuery` of `@chamvi/http`).
 * Loads `@rapiq/adapter-typeorm` on the first call.
 */
export async function applyQuery<E extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<E>,
    query: IQuery,
    options: ApplyQueryOptions = {},
): Promise<ApplyQueryResult> {
    const { TypeormAdapter } = await loadTypeormAdapter();
    const { metadata } = queryBuilder.expressionMap.mainAlias!;
    const adapter = new TypeormAdapter({ queryBuilder });
    const { pagination } = adapter.execute(prepareQuery(query, metadata, options.fields ?? {}, options.entity), { caseSensitive: true });

    return {
        ...(pagination.limit !== undefined ? { limit: pagination.limit } : {}),
        ...(pagination.offset !== undefined ? { offset: pagination.offset } : {}),
    };
}
