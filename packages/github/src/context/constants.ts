/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineContextKey } from '@chamvi/core';
import type { IGithubAppResolver } from './types.ts';

/** The GitHub App(s) provided on the engine, resolved per agent. */
export const GITHUB_CONTEXT = defineContextKey<IGithubAppResolver>('github');
