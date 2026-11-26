/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { ValidationError } from '@chamvi/errors';
import { InvalidAgentDefinitionError, defineEffectTool, effectMarker } from '@chamvi/core';
import { isObject } from 'smob';
import type { GithubProposalsOptions, IGithubApp } from '../app/types.ts';
import {
    REPO_PROPERTY,
    assertHead,
    branchMarker,
    checkDiff,
    findPulls,
    hasProposalFooter,
    headOf,
    isNotFound,
    objectSchema,
    orphanHasEffect,
    parseRepo,
    proposalBranch,
    proposalKey,
    pullHasEffect,
    readFile,
    safePath,
    selectBranch,
    validateProposal,
    withOctokit,
} from './helpers/index.ts';
import { MAX_HISTORY_COMMITS } from './constants.ts';
import { createPullRequest, toCreated } from './pull-operation.ts';
import type { GithubCreatedPullRequest, GithubProposeChangeInput } from './types.ts';

/** Validate and snapshot policy before any tools can be built, retaining no caller-owned objects. */
export function normalizeProposals(input: GithubProposalsOptions | undefined): GithubProposalsOptions | undefined {
    if (input === undefined) {
        return undefined;
    }

    if (!isObject(input) || !isObject(input.repos) || Array.isArray(input.repos)) {
        throw new InvalidAgentDefinitionError('proposals.repos must be a repository allowlist.');
    }

    const repos: GithubProposalsOptions['repos'] = {};

    for (const [name, policy] of Object.entries(input.repos)) {
        try {
            parseRepo(name);
        } catch {
            throw new InvalidAgentDefinitionError('proposals.repos keys must look like owner/name.');
        }

        const validPaths = isObject(policy) && Array.isArray(policy.paths) && policy.paths.length > 0 &&
            policy.paths.every((path: unknown) => typeof path === 'string' && safePath(path.replaceAll('?', 'x')));

        if (!validPaths) {
            throw new InvalidAgentDefinitionError('proposals.repos paths must be non-empty, safe repository-relative globs (not .github, .husky, CODEOWNERS or .gitmodules).');
        }

        const key = name.toLowerCase();

        if (repos[key]) {
            throw new InvalidAgentDefinitionError('proposals.repos contains duplicate repositories.');
        }

        repos[key] = { paths: [...policy.paths] };
    }

    return { repos };
}

export function createProposalTools(app: IGithubApp, policy: GithubProposalsOptions): ToolSet {
    return {
        github_propose_change: defineEffectTool<GithubProposeChangeInput, GithubCreatedPullRequest>({
            trust: { guardWhenTainted: true },
            description: 'Propose replacement file content in an allowlisted repository/path. Creates or updates one stable branch and open PR for this agent and path. Never merges; .github, .husky, CODEOWNERS and .gitmodules paths are forbidden.',
            inputSchema: objectSchema<GithubProposeChangeInput>({
                repo: REPO_PROPERTY,
                path: { type: 'string', minLength: 1 },
                content: { type: 'string' },
                reason: { type: 'string', minLength: 1 },
            }, ['repo', 'path', 'content', 'reason']),
            effectKey(input, ctx, options) {
                validateProposal(input, policy);

                return proposalKey(input, ctx, options);
            },
            async alreadyApplied(key, input, ctx) {
                const target = validateProposal(input, policy);
                const root = proposalBranch(input, ctx);

                return withOctokit(app, ctx, target, async (octokit) => {
                    const pulls = await findPulls(octokit, target, root);

                    for (const pull of pulls) {
                        if (!hasProposalFooter(pull.body, pull.head.ref)) {
                            throw new ValidationError('Existing proposal PR is not proposal-owned.');
                        }

                        // A later run replaces the body and tip marker, but not commit ancestry.
                        // The PR head SHA also survives merge and deletion of its branch.
                        if ((await pullHasEffect(octokit, target, pull, effectMarker(key))).found) {
                            if (pull.state === 'open') {
                                const base = await headOf(octokit, target, pull.base.ref);

                                // The diff is pinned to the observed base SHA; the base is not
                                // re-checked, since a busy default branch moving meanwhile would
                                // report an applied effect as a failure.
                                await checkDiff(octokit, target, base, pull.head.sha, policy);
                                await readFile(octokit, target, input.path, pull.head.sha);
                                await assertHead(octokit, target, pull.head.ref, pull.head.sha);
                            }

                            return toCreated(pull);
                        }
                    }

                    return undefined;
                });
            },
            async execute(input, options) {
                const target = validateProposal(input, policy);
                const ctx = options.context;
                const root = proposalBranch(input, ctx);
                const effect = effectMarker(proposalKey(input, ctx, options));
                const title = `Propose change to ${input.path}`.slice(0, 256);

                return withOctokit(app, ctx, target, async (octokit) => {
                    const pulls = await findPulls(octokit, target, root);
                    const branch = selectBranch(root, pulls);
                    const pull = pulls.find((item) => item.head.ref === branch && item.state === 'open');
                    const marker = branchMarker(branch);
                    const body = `${input.reason}\n\n${marker}\n${effect}`;
                    const { data: repository } = await octokit.request('GET /repos/{owner}/{repo}', target);
                    const base = pull?.base.ref ?? repository.default_branch;
                    const baseSha = await headOf(octokit, target, base);

                    if (pull && !hasProposalFooter(pull.body, branch)) {
                        throw new ValidationError('Existing proposal PR is not proposal-owned.');
                    }

                    let head: string;

                    try {
                        head = await headOf(octokit, target, branch);
                    } catch (error) {
                        if (!isNotFound(error)) {
                            throw error;
                        }

                        head = baseSha;
                        await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
                            ...target,
                            ref: `refs/heads/${branch}`,
                            sha: head,
                        });
                    }

                    const diff = await checkDiff(octokit, target, baseSha, head, policy);
                    const { data: commit } = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
                        ...target,
                        commit_sha: head,
                    });

                    if (!pull && diff.status !== 'identical' && !hasProposalFooter(commit.message, branch)) {
                        throw new ValidationError('Existing proposal branch is not proposal-owned.');
                    }

                    if (!pull && !diff.merge_base_commit?.sha) {
                        throw new ValidationError('Proposal merge base is unavailable; manual review is required.');
                    }

                    // Finish publication after a lost checkpoint without overwriting a later run.
                    const history = pull ? await pullHasEffect(octokit, target, pull, effect) : undefined;
                    const applied = history?.found ?? await orphanHasEffect(octokit, target, head, diff.merge_base_commit.sha, effect, branch);
                    const file = await readFile(octokit, target, input.path, head);

                    if (!applied) {
                        if (history && history.commits >= MAX_HISTORY_COMMITS - 1) {
                            throw new ValidationError('Proposal PR is at its history capacity; close or merge it before proposing another update.');
                        }

                        if (!pull && diff.status === 'identical' && file.content === input.content) {
                            throw new ValidationError('Proposal content already matches the base; no pull request is needed.');
                        }

                        let { tree } = file;

                        if (file.content !== input.content) {
                            const { data: updated } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
                                ...target,
                                base_tree: tree,
                                tree: [{
                                    path: input.path,
                                    mode: file.mode,
                                    type: 'blob',
                                    content: input.content,
                                }],
                            });

                            tree = updated.sha;
                        }

                        // An unchanged file still needs a durable per-run marker for cross-run replay safety.
                        const { data: next } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
                            ...target,
                            message: `${title}\n\n${marker}\n${effect}`,
                            tree,
                            parents: [head],
                        });

                        await checkDiff(octokit, target, baseSha, next.sha, policy);
                        await assertHead(octokit, target, branch, head);
                        await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
                            ...target,
                            ref: `heads/${branch}`,
                            sha: next.sha,
                            force: false,
                        });
                        head = next.sha;
                    }

                    const finalDiff = await checkDiff(octokit, target, baseSha, head, policy);

                    if (!pull && finalDiff.files?.length === 0) {
                        throw new ValidationError('Proposal content already matches the base; no pull request is needed.');
                    }

                    await assertHead(octokit, target, branch, head);
                    await assertHead(octokit, target, base, baseSha);

                    const result = pull ? await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
                        ...target,
                        pull_number: pull.number,
                        title,
                        body,
                    }).then(({ data }) => toCreated(data)) : await createPullRequest(octokit, target, {
                        head: branch,
                        base,
                        title,
                        body,
                    });

                    // The base is not re-checked here: a busy default branch moving after
                    // the PR write would report an applied effect as a failure.
                    await assertHead(octokit, target, branch, head);

                    return result;
                });
            },
        }),
    };
}
