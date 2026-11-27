/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ARTIFACT_MEDIA_TYPE_PATTERN } from './constants.ts';

/**
 * True for a media type an artifact may carry: `type/subtype` (RFC 6838
 * restricted names, case-insensitive) without parameters.
 */
export function isArtifactMediaType(value: unknown): value is string {
    return typeof value === 'string' && ARTIFACT_MEDIA_TYPE_PATTERN.test(value);
}
