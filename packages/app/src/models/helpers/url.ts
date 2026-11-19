/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';

/**
 * The value when it is an absolute http(s) URL without credentials, query or
 * fragment; else InvalidAgentDefinitionError naming `field`, never the value.
 */
export function assertBaseUrl(value: string, field: string): string {
    let url: URL | undefined;

    try {
        url = new URL(value);
    } catch {
        url = undefined;
    }

    if (
        !url ||
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username !== '' ||
        url.password !== '' ||
        url.search !== '' ||
        url.hash !== '' ||
        value.includes('?') ||
        value.includes('#')
    ) {
        throw new InvalidAgentDefinitionError(
            `${field} must be an absolute http(s) URL without credentials, query or fragment.`,
        );
    }

    return value;
}

/** A base URL for display: origin plus pathname. */
export function describeBaseUrl(url: string): string {
    const parsed = new URL(url);

    return `${parsed.origin}${parsed.pathname}`;
}
