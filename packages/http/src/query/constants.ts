/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { FilterFieldOperator } from '@rapiq/core';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../app/constants.ts';
import type { ListFilterOperator } from './types.ts';

/** The page size of a list without `page[limit]`, unless its schema sets `defaultLimit`. */
export const LIST_DEFAULT_LIMIT = DEFAULT_PAGE_LIMIT;

/** The largest `page[limit]` a list takes, unless its schema sets `maxLimit`. */
export const LIST_MAX_LIMIT = MAX_PAGE_LIMIT;

/** The operators a filter field takes when its schema names none for it: equality, lists and comparisons. */
export const LIST_DEFAULT_OPERATORS: readonly ListFilterOperator[] = ['eq', 'ne', 'in', 'nin', 'lt', 'lte', 'gt', 'gte'];

/** Every operator rapiq decodes for a filter field. */
export const LIST_OPERATORS: readonly ListFilterOperator[] = Object.values(FilterFieldOperator);

/** The tie break of every order, unless the schema sets `key`. */
export const LIST_DEFAULT_KEY: readonly string[] = ['id'];

/**
 * Keys no query parameter may name in a bracket segment (`filter[__proto__]`,
 * `page[constructor]`): object prototype names a decoder would otherwise
 * read through or drop without a refusal.
 */
export const LIST_RESERVED_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];
