/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createURLCodec } from '@rapiq/codec-url';
import { defineQuery, isQuery } from '@rapiq/core';
import type { ObjectLiteral } from '@rapiq/core';
import type { EntityQueryInput } from './types.ts';

const codec = createURLCodec();

/** The query as a URL query string (`?`-prefixed, `''` when there is nothing to send); the server decodes it with the same codec. */
export function buildQueryString<T extends ObjectLiteral>(input?: EntityQueryInput<T>): string {
    if (!input) {
        return '';
    }

    const encoded = codec.encode(isQuery(input) ? input : defineQuery<T>(input));

    return encoded ? `?${encoded}` : '';
}
