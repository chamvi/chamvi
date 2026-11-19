/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Octokit } from '@octokit/core';
import { paginateRest } from '@octokit/plugin-paginate-rest';

export const PaginatedOctokit = Octokit.plugin(paginateRest);
