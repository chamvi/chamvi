/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { GithubInstallation, GithubPermissions } from '../types.ts';

/** True when two GitHub logins name the same account (logins are case-insensitive). */
export function isSameLogin(a: unknown, b: string): boolean {
    return typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
}

function stringOf(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** A `GET /app/installations` item as a GithubInstallation (an enterprise account has a slug, no login). */
export function toInstallation(item: unknown): GithubInstallation {
    const data = isObject(item) ? item : {};
    const account = isObject(data.account) ? data.account : {};
    const permissions: GithubPermissions = {};

    if (isObject(data.permissions)) {
        for (const [name, level] of Object.entries(data.permissions)) {
            if (level === 'read' || level === 'write') {
                permissions[name] = level;
            }
        }
    }

    return {
        id: Number(data.id),
        account: stringOf(account.login) ?? stringOf(account.slug) ?? '',
        accountType: stringOf(account.type) ?? (stringOf(account.slug) ? 'Enterprise' : 'User'),
        repositorySelection: data.repository_selection === 'all' ? 'all' : 'selected',
        permissions,
        suspended: typeof data.suspended_at === 'string',
    };
}
