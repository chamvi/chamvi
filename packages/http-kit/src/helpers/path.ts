/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ApiError } from '../error/module.ts';
import { PATH_SEGMENT_INVALID_ERROR_CODE } from './constants.ts';

/**
 * Turn an id or name into one path segment. An empty value, `.` and `..`
 * are refused before any request is sent (the URL parser would fold a dot
 * segment into another path); everything else is percent-encoded, so `/`,
 * `?` and `#` cannot add segments or a query. `@` stays literal: it is a
 * valid path character.
 *
 * @throws ApiError (status 0) with code `path_segment_invalid`
 */
export function encodePathSegment(input: string | number): string {
    const value = `${input}`;

    if (value === '' || value === '.' || value === '..') {
        throw new ApiError(0, PATH_SEGMENT_INVALID_ERROR_CODE, `The path segment "${value}" is not valid.`);
    }

    return encodeURIComponent(value).replace(/%40/g, '@');
}

/** `/a/b` from the segments, each through `encodePathSegment()`. */
export function path(...segments: (string | number)[]): string {
    return segments.map((segment) => `/${encodePathSegment(segment)}`).join('');
}
