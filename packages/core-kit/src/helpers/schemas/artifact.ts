/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { z } from 'zod';
import { isArtifactMediaType } from '../../domains/artifact/helpers.ts';
import { BASE64_PATTERN } from '../constants.ts';
import { reportInvalid } from './report.ts';

/** A media type `type/subtype` without parameters. */
export function mediaTypeSchema() {
    return z.custom<string>().check((ctx) => {
        if (!isArtifactMediaType(ctx.value)) {
            reportInvalid(ctx, 'must be a media type of the form type/subtype');
        }
    });
}

/**
 * The end of a canonical (zero pad bits) base64 string: no padding, or before
 * `=` a character whose low 2 bits are zero, before `==` one whose low 4 are.
 */
const BASE64_CANONICAL_END_PATTERN = /(?:^|[^=]|[AEIMQUYcgkosw048]=|[AQgw]==)$/;

/**
 * Strict base64 by its characters (RFC 4648 section 4: padded, no whitespace,
 * no url-safe alphabet, zero pad bits); the string is kept, decoding is the
 * reader's. Never echoes the (up to the body limit) input back.
 */
export function base64Schema() {
    return z.custom<string>().check((ctx) => {
        const { value } = ctx;

        if (typeof value !== 'string' || !BASE64_PATTERN.test(value) || !BASE64_CANONICAL_END_PATTERN.test(value)) {
            reportInvalid(ctx, 'must be strict base64', false);
        }
    });
}
