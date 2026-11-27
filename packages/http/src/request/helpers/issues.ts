/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { boundReceived } from '@chamvi/core-kit';
import type { Issue } from '@ebec/core';

/** `issues` (groups walked) without a `received` value over core-kit's `RECEIVED_MAX_LENGTH`. */
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
