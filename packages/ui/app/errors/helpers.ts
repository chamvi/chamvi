/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { asApiError } from '@chamvi/ui-kit';

/**
 * The inline line of an action the API refused. A 403 names the permission
 * it needs (`<action> needs <permission> for <target>.`): the one the
 * server's message names, else `permission`. The session's verdicts are an
 * upper bound, so a shown control can still be refused for this resource.
 * Any other error is `<code> · <message>`.
 */
export function refusalText(error: unknown, action: string, permission: string, target: string): string {
    const apiError = asApiError(error);

    if (apiError.status !== 403) {
        return `${apiError.code} · ${apiError.message}`;
    }

    const named = /\bchamvi_[a-z_]+\b/.exec(apiError.message)?.[0] ?? permission;

    return `${action} needs ${named} for ${target}.`;
}
