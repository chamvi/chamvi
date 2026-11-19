/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Issue } from '@ebec/core';
import { RECEIVED_MAX_LENGTH } from '../constants.ts';

/**
 * `value` when its JSON has at most `RECEIVED_MAX_LENGTH` characters, else
 * `undefined`: what a validation issue may carry as `received`.
 */
export function boundReceived(value: unknown): unknown {
    if (value === undefined) {
        return undefined;
    }

    try {
        const json = JSON.stringify(value);

        return json !== undefined && json.length <= RECEIVED_MAX_LENGTH ? value : undefined;
    } catch {
        return undefined;
    }
}

/** `issues` (groups walked) without a `received` value over `RECEIVED_MAX_LENGTH`. */
export function boundIssues(issues: readonly Issue[]): Issue[] {
    return issues.map((issue) => {
        if (issue.type === 'group') {
            return { ...issue, issues: boundIssues(issue.issues) };
        }

        if (!('received' in issue) || boundReceived(issue.received) !== undefined) {
            return issue;
        }

        const bounded = { ...issue };

        delete bounded.received;

        return bounded;
    });
}
