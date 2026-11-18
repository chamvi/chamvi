/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createURLCodec } from '@rapiq/codec-url';
import type { IQuery, Schema } from '@rapiq/core';
import { RUN_LIST_QUERY_SCHEMA } from './constants.ts';

const codec = createURLCodec();

/**
 * A run list query from a URL query string (e.g. a route query), checked by
 * `RUN_LIST_QUERY_SCHEMA`: a key it does not allow is dropped, a limit above
 * 100 capped; a malformed query reads as the empty one.
 */
export function decodeRunListQuery(input: string | URLSearchParams): IQuery {
    const text = typeof input === 'string' ? input.replace(/^\?/, '') : input.toString();
    // rapiq's Schema is invariant in its record type; the codec takes any of them
    const options = { schema: RUN_LIST_QUERY_SCHEMA as Schema<any> };

    try {
        return codec.decode(text, options) ?? codec.decode('', options)!;
    } catch {
        return codec.decode('', options)!;
    }
}
