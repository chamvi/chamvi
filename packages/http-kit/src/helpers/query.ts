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

    const query = isQuery(input) ? input : defineQuery<T>(input);
    let encoded: string | null;

    // the simple (bracket) dialect first: the expression dialect refuses a text
    // value that reads as another literal (an agent named `null` or `007`)
    try {
        encoded = codec.encode(query, { codec: 'url-simple' });
    } catch {
        encoded = codec.encode(query);
    }

    return encoded ? `?${encoded}` : '';
}
