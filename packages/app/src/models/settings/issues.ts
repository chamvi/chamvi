/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { SettingIssues } from './types.ts';

export function issueMessageOf(error: unknown): string {
    return Error.isError(error) ? error.message : String(error);
}

export function reportSettingIssue(issues: SettingIssues, message: string, provider?: string): void {
    if (typeof provider === 'undefined') {
        issues.list.push({ message });

        return;
    }

    issues.list.push({ provider, message });
    issues.failed.add(provider);
}

export function attemptSettingField(issues: SettingIssues, provider: string | undefined, fn: () => void): void {
    try {
        fn();
    } catch (error) {
        reportSettingIssue(issues, issueMessageOf(error), provider);
    }
}
