/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import { isObject } from 'smob';
import type { GithubOctokit, GithubProposalsOptions } from '../../app/types.ts';
import { MAX_HISTORY_COMMITS } from '../constants.ts';
import type { RepoTarget } from '../types.ts';
import { allowedPath, hasEffectFooter, hasProposalFooter } from './proposal-policy.ts';

export function isNotFound(error: unknown): boolean {
    return isObject(error) && error.status === 404;
}

export async function headOf(octokit: GithubOctokit, target: RepoTarget, branch: string): Promise<string> {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
        ...target,
        ref: `heads/${branch}`,
    });

    return data.object.sha;
}

export async function assertHead(octokit: GithubOctokit, target: RepoTarget, branch: string, sha: string): Promise<void> {
    if (await headOf(octokit, target, branch) !== sha) {
        throw new ValidationError('Proposal branch moved during execution; retry after reviewing concurrent writes.');
    }
}

/** Contents dereferences symlinks. Walk the pinned Git tree instead, including every parent directory. */
export async function readFile(octokit: GithubOctokit, target: RepoTarget, path: string, sha: string) {
    const { data: commit } = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
        ...target,
        commit_sha: sha,
    });
    let tree = commit.tree.sha;
    const parts = path.split('/');

    for (const [index, part] of parts.entries()) {
        const { data } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
            ...target,
            tree_sha: tree,
        });

        if (data.truncated) {
            throw new ValidationError('Proposal tree is truncated.');
        }

        const entry = data.tree.find((item) => item.path === part);

        if (!entry) {
            return {
                tree: commit.tree.sha,
                mode: '100644' as const,
                content: undefined,
            };
        }

        if (index < parts.length - 1) {
            if (entry.type !== 'tree' || entry.mode !== '040000' || !entry.sha) {
                throw new ValidationError('Proposal parent must be a directory, not a symlink or submodule.');
            }

            tree = entry.sha;
        } else {
            if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode ?? '') || !entry.sha) {
                throw new ValidationError('Proposal path must be a regular file.');
            }

            const { data: blob } = await octokit.request('GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
                ...target,
                file_sha: entry.sha,
            });

            if (blob.encoding !== 'base64') {
                throw new ValidationError('Proposal blob must be Base64 encoded.');
            }

            return {
                tree: commit.tree.sha,
                mode: entry.mode as '100644' | '100755',
                content: Buffer.from(blob.content, 'base64').toString('utf8'),
            };
        }
    }

    throw new ValidationError('Proposal path must not be empty.');
}

const MAX_PULL_PAGES = 10;
const MAX_GENERATIONS = 250;

/** The PRs of one head branch (`head=<owner>:<branch>`), never a scan of the repository's PRs. */
export async function pullsOf(octokit: GithubOctokit, target: RepoTarget, branch: string) {
    const pulls = [];
    let pageCount = 0;
    const pages = octokit.paginate.iterator('GET /repos/{owner}/{repo}/pulls', {
        ...target,
        state: 'all',
        head: `${target.owner}:${branch}`,
        per_page: 100,
    });

    for await (const page of pages) {
        pageCount += 1;

        // A full final page may have more results. Never select a generation from
        // incomplete discovery, even if the matching PRs were on earlier pages.
        if (pageCount >= MAX_PULL_PAGES && page.data.length >= 100) {
            throw new ValidationError('Proposal PR discovery limit exceeded; manual review is required.');
        }

        pulls.push(...page.data.filter((item) => item.head.ref === branch &&
            item.head.repo?.full_name.toLowerCase() === `${target.owner}/${target.repo}`.toLowerCase()));
    }

    return pulls;
}

/**
 * Every generation of a proposal: the root branch, then `<root>-g-<n>` for the number
 * `n` of every PR found so far (`selectBranch` names the next generation after the
 * highest one). Following each number, not only the highest, keeps a PR off the
 * predicted chain (a human's PR on a proposal branch) from hiding the tool's own open
 * PR, so the multiple-open guard still sees it. Each step is one filtered request, so
 * the repository's PR count is irrelevant.
 */
export async function findPulls(octokit: GithubOctokit, target: RepoTarget, root: string) {
    const pulls: Awaited<ReturnType<typeof pullsOf>> = [];
    const seen = new Set<string>([root]);
    const queue = [root];

    for (let requests = 0; requests < MAX_GENERATIONS; requests += 1) {
        const branch = queue.shift();

        if (branch === undefined) {
            return pulls;
        }

        for (const pull of await pullsOf(octokit, target, branch)) {
            pulls.push(pull);

            const next = `${root}-g-${pull.number}`;

            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
        }
    }

    if (queue.length === 0) {
        return pulls;
    }

    throw new ValidationError('Proposal generation limit exceeded; manual review is required.');
}

type ProposalPull = Awaited<ReturnType<typeof findPulls>>[number];

export function selectBranch(root: string, pulls: ProposalPull[]): string {
    const open = pulls.filter((pull) => pull.state === 'open');

    if (open.length > 1) {
        throw new ValidationError('Multiple open proposal branches require manual review.');
    }

    // All runs converge on the same next generation, including retries before PR creation.
    const previous = Math.max(0, ...pulls.map((pull) => pull.number));

    return open[0]?.head.ref ?? (previous === 0 ? root : `${root}-g-${previous}`);
}

export async function pullHasEffect(
    octokit: GithubOctokit,
    target: RepoTarget,
    pull: ProposalPull,
    marker: string,
): Promise<{ found: boolean; commits: number }> {
    // GitHub retains PR commits after merge/deletion. Comparing today's base SHA
    // to the head instead can erase the very commits needed for reconciliation.
    const pages = octokit.paginate.iterator('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
        ...target,
        pull_number: pull.number,
        per_page: 100,
    });
    let inspected = 0;

    for await (const page of pages) {
        inspected += page.data.length;

        // Positive evidence is sufficient even if the remaining history is capped.
        const found = page.data.some((commit) => hasEffectFooter(commit.commit.message, pull.head.ref, marker));

        if (found) {
            return { found: true, commits: inspected };
        }

        // The PR endpoint silently caps results at 250 commits. Never infer absence there.
        if (inspected >= MAX_HISTORY_COMMITS) {
            throw new ValidationError('Proposal history limit exceeded; manual review is required.');
        }
    }

    return { found: false, commits: inspected };
}

export async function orphanHasEffect(
    octokit: GithubOctokit,
    target: RepoTarget,
    sha: string,
    base: string,
    marker: string,
    branch: string,
): Promise<boolean> {
    // An unpublished branch has no PR commit list. Only follow its tool-owned,
    // single-parent chain, refusing ambiguity rather than missing an older effect.
    let remaining = MAX_HISTORY_COMMITS;

    while (sha !== base && remaining > 0) {
        remaining -= 1;

        const { data: commit } = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
            ...target,
            commit_sha: sha,
        });

        if (!hasProposalFooter(commit.message, branch)) {
            throw new ValidationError('Proposal commit ancestry is not proposal-owned; manual review is required.');
        }

        if (commit.parents.length !== 1 || !commit.parents[0]?.sha) {
            throw new ValidationError('Proposal commit ancestry is not a single-parent chain; manual review is required.');
        }

        if (hasEffectFooter(commit.message, branch, marker)) {
            return true;
        }

        sha = commit.parents[0].sha;
    }

    if (sha !== base) {
        throw new ValidationError('Proposal history limit exceeded; manual review is required.');
    }

    return false;
}

/** Compare files are only returned on page one, capped at 300. Reject the cap rather than trusting a truncated diff. */
export async function checkDiff(octokit: GithubOctokit, target: RepoTarget, base: string, branch: string, policy: GithubProposalsOptions) {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
        ...target,
        basehead: `${base}...${branch}`,
        per_page: 1,
    });
    const { files } = data;
    const safe = files !== undefined && files.length < 300 && files.every((file) =>
        allowedPath(file.filename, `${target.owner}/${target.repo}`, policy) &&
        (!file.previous_filename || allowedPath(file.previous_filename, `${target.owner}/${target.repo}`, policy)));

    if (!safe) {
        throw new ValidationError('Proposal branch diff is unavailable, truncated, or contains disallowed paths.');
    }

    return data;
}
