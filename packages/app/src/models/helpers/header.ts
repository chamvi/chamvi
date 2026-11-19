/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { HEADER_NAME_PATTERN } from '../constants.ts';

/** The header name of an env suffix: `X_TEAM` -> `x-team`. */
export function headerName(envName: string): string {
    return envName.toLowerCase().replaceAll('_', '-');
}

/** The header name lower-cased; InvalidAgentDefinitionError naming `field` when it breaks HEADER_NAME_PATTERN. */
export function assertHeaderName(name: string, field: string): string {
    const lower = name.toLowerCase();

    if (!HEADER_NAME_PATTERN.test(lower)) {
        throw new InvalidAgentDefinitionError(
            `${field} names a header that is not lower-kebab (must match ${HEADER_NAME_PATTERN}).`,
        );
    }

    return lower;
}
