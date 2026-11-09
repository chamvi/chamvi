/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IGithubApp } from '../app/types.ts';

/** What the engine holds: the GitHub App per agent. */
export interface IGithubAppResolver {
    appFor(agent: string): IGithubApp;
}
