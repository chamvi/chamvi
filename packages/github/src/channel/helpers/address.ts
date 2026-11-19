/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isPositiveInteger } from '../../subscription/helpers.ts';
import { REPO_PATTERN } from '../../tools/constants.ts';
import type { CommentTarget } from '../types.ts';

// REPO_PATTERN without its end anchor, then `#<number>`
const ADDRESS = new RegExp(`${REPO_PATTERN.slice(0, -1)}#([1-9]\\d*)$`);

/** `owner/repo#number` as owner, repo and number; `undefined` for anything else. */
export function parseAddress(address: unknown): CommentTarget | undefined {
    const match = typeof address === 'string' ? ADDRESS.exec(address) : null;

    if (!match?.[1] || !match[2] || !match[3]) {
        return undefined;
    }

    const number = Number(match[3]);

    if (!isPositiveInteger(number)) {
        return undefined;
    }

    return {
        owner: match[1],
        repo: match[2],
        number,
    };
}
