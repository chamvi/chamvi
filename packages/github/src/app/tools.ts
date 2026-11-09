/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { resolveMergeMethod } from '../tools/helpers.ts';
import { createPullRequestWriteTools } from '../tools/merge.ts';
import type { normalizeProposals } from '../tools/proposals.ts';
import { createProposalTools } from '../tools/proposals.ts';
import { createPullRequestTools } from '../tools/pulls.ts';
import { createReadTools } from '../tools/read.ts';
import { createRepositoryTools } from '../tools/repositories.ts';
import { createWriteTools } from '../tools/write.ts';
import type { GithubWriteToolsOptions, IGithubApp } from './types.ts';

/** The read tools over `app`, which may be a deferred one: every tool reaches GitHub through it. */
export function buildReadTools(app: IGithubApp): ToolSet {
    return {
        ...createReadTools(app),
        ...createRepositoryTools(app),
        ...createPullRequestTools(app),
    };
}

/** The write tools over `app`; `proposals` from `normalizeProposals()`. */
export function buildWriteTools(
    app: IGithubApp,
    proposals: ReturnType<typeof normalizeProposals>,
    options?: GithubWriteToolsOptions,
): ToolSet {
    const mergeMethod = resolveMergeMethod(options?.mergeMethod);

    return {
        ...createWriteTools(app),
        ...createPullRequestWriteTools(app, { mergeMethod }),
        ...(proposals && createProposalTools(app, proposals)),
    };
}
