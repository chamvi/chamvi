/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { defineTool } from '@chamvi/core';
import type { IGithubApp } from '../app/types.ts';
import { toPullRequest } from './pulls.ts';
import { createReleaseTools } from './releases.ts';
import {
    FILE_MAX_CHARS,
    SEARCH_DEFAULT_RESULTS,
    SEARCH_MAX_RESULTS,
} from './constants.ts';
import {
    REPO_PROPERTY,
    labelName,
    login,
    numberSchema,
    objectSchema,
    parseRepo,
    repoSchema,
    requireInteger,
    requireString,
    searchTarget,
    withOctokit,
} from './helpers/index.ts';
import type {
    GithubDirectory,
    GithubFile,
    GithubIssue,
    GithubIssueSearch,
    GithubLabel,
    GithubPullRequest,
    NumberInput,
    RepoInput,
} from './types.ts';

/** The `owner/name` of an API URL ending in `/repos/<owner>/<name>`. */
function repoOfUrl(url: unknown): string {
    if (typeof url !== 'string') {
        return '';
    }

    return url.split('/').slice(-2).join('/');
}

function decodeFile(path: string, data: Record<string, unknown>): GithubFile {
    const size = typeof data.size === 'number' ? data.size : 0;

    // GitHub sends no content (encoding 'none') for files above 1 MB
    if (data.encoding !== 'base64' || typeof data.content !== 'string') {
        return {
            path,
            size,
            content: '',
            truncated: size > 0,
        };
    }

    const text = Buffer.from(data.content, 'base64').toString('utf8');

    return {
        path,
        size,
        content: text.slice(0, FILE_MAX_CHARS),
        truncated: text.length > FILE_MAX_CHARS,
    };
}

/**
 * The read-only GitHub tools: issues, search, labels, pull requests,
 * files, releases and comparisons. Each acts as the run's installation.
 */
export function createReadTools(app: IGithubApp): ToolSet {
    return {
        github_get_issue: defineTool<NumberInput, GithubIssue>({
            trust: { taint: true },
            description: 'Read one issue (or pull request) of a repository: title, body, state, labels, author.',
            inputSchema: numberSchema('issue'),
            execute: async (input, { context }) => {
                const { owner, repo } = parseRepo(input.repo);
                const issueNumber = requireInteger(input.number, 'number', 1);

                return withOctokit(app, context, { owner, repo }, async (octokit) => {
                    const { data } = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
                        owner,
                        repo,
                        issue_number: issueNumber,
                    });

                    return {
                        number: data.number,
                        title: data.title,
                        body: data.body ?? null,
                        state: data.state,
                        labels: (data.labels as unknown[]).map(labelName),
                        author: login(data.user),
                        url: data.html_url,
                        createdAt: data.created_at,
                        comments: data.comments,
                        isPullRequest: data.pull_request !== undefined && data.pull_request !== null,
                    };
                });
            },
        }),

        github_search_issues: defineTool<{ query: string; limit?: number }, GithubIssueSearch>({
            trust: { taint: true },
            description: 'Search issues and pull requests with GitHub\'s search syntax, e.g. "repo:owner/name is:issue is:open crash".',
            inputSchema: objectSchema({
                query: {
                    type: 'string',
                    minLength: 1,
                    description: 'A GitHub issue search query.',
                },
                limit: {
                    type: 'integer',
                    minimum: 1,
                    maximum: SEARCH_MAX_RESULTS,
                    description: `How many results to return (default ${SEARCH_DEFAULT_RESULTS}).`,
                },
            }, ['limit']),
            execute: async (input, { context }) => {
                const query = requireString(input.query, 'query');
                const limit = input.limit === undefined ?
                    SEARCH_DEFAULT_RESULTS :
                    requireInteger(input.limit, 'limit', 1, SEARCH_MAX_RESULTS);

                return withOctokit(app, context, searchTarget(query), async (octokit) => {
                    const { data } = await octokit.request('GET /search/issues', {
                        q: query,
                        per_page: limit,
                        advanced_search: 'true',
                    });

                    return {
                        total: data.total_count,
                        items: data.items.map((item) => ({
                            repo: repoOfUrl(item.repository_url),
                            number: item.number,
                            title: item.title,
                            state: item.state,
                            url: item.html_url,
                        })),
                    };
                });
            },
        }),

        github_list_labels: defineTool<RepoInput, GithubLabel[]>({
            trust: { taint: true },
            description: 'List every label of a repository with its description.',
            inputSchema: repoSchema(),
            execute: async (input, { context }) => {
                const { owner, repo } = parseRepo(input.repo);

                return withOctokit(app, context, { owner, repo }, async (octokit) => {
                    const labels = await octokit.paginate('GET /repos/{owner}/{repo}/labels', {
                        owner,
                        repo,
                        per_page: 100,
                    });

                    return labels.map((label) => ({ name: label.name, description: label.description ?? null }));
                });
            },
        }),

        github_get_pull_request: defineTool<NumberInput, GithubPullRequest>({
            trust: { taint: true },
            description: 'Read one pull request: title, body, state, branches, head sha and repository (fork or not), author and its type, labels, mergeability, number of changed files.',
            inputSchema: numberSchema('pull request'),
            execute: async (input, { context }) => {
                const { owner, repo } = parseRepo(input.repo);
                const pullNumber = requireInteger(input.number, 'number', 1);

                return withOctokit(app, context, { owner, repo }, async (octokit) => {
                    const { data } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
                        owner,
                        repo,
                        pull_number: pullNumber,
                    });

                    return toPullRequest(data);
                });
            },
        }),

        github_get_file: defineTool<RepoInput & { path: string; ref?: string }, GithubFile | GithubDirectory>({
            trust: { taint: true },
            description: `Read a file (UTF-8 text, cut after ${FILE_MAX_CHARS} characters) or list a directory of a repository.`,
            inputSchema: objectSchema({
                repo: REPO_PROPERTY,
                path: {
                    type: 'string',
                    minLength: 1,
                    description: 'The path in the repository, e.g. "src/index.ts".',
                },
                ref: {
                    type: 'string',
                    minLength: 1,
                    description: 'A branch, tag or commit (default: the default branch).',
                },
            }, ['ref']),
            execute: async (input, { context }) => {
                const { owner, repo } = parseRepo(input.repo);
                const path = requireString(input.path, 'path').replace(/^\/+|\/+$/g, '');
                const ref = input.ref === undefined ? undefined : requireString(input.ref, 'ref');

                return withOctokit(app, context, { owner, repo }, async (octokit) => {
                    const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                        owner,
                        repo,
                        path,
                        ...(ref !== undefined ? { ref } : {}),
                    });

                    if (Array.isArray(data)) {
                        return {
                            path,
                            entries: data.map((entry) => ({
                                name: entry.name,
                                type: entry.type,
                                path: entry.path,
                            })),
                        };
                    }

                    return decodeFile(path, data as unknown as Record<string, unknown>);
                });
            },
        }),

        ...createReleaseTools(app),
    };
}
