/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { GithubMergeMethod } from '../../app/types.ts';
import {
    DEFAULT_MERGE_METHOD,
    MERGE_METHODS,
    REF_PATTERN,
    REPO_PATTERN,
} from '../constants.ts';
import type { RepoTarget } from '../types.ts';

const REPO = new RegExp(REPO_PATTERN);

/** `owner/name`; a ValidationError (a tool error the model can correct) otherwise. */
export function parseRepo(repo: unknown): { owner: string; repo: string } {
    const match = typeof repo === 'string' ? REPO.exec(repo) : null;

    if (!match?.[1] || !match[2]) {
        throw new ValidationError(`repo must look like "owner/name", got ${JSON.stringify(repo)}.`);
    }

    return { owner: match[1], repo: match[2] };
}

/** The repository of a search query's single `repo:owner/name` qualifier (an unparsable one ignored), else undefined. */
export function searchTarget(query: string): RepoTarget | undefined {
    const targets: RepoTarget[] = [];

    for (const match of query.matchAll(/(?:^|\s)repo:(\S+)/g)) {
        try {
            targets.push(parseRepo(match[1]));
        } catch {
            // not a repository: no target from it
        }
    }

    return targets.length === 1 ? targets[0] : undefined;
}

const REF = new RegExp(REF_PATTERN);

/** A branch, tag or commit (REF_PATTERN, no `..`), else a ValidationError. */
export function requireRef(value: unknown, name: string): string {
    const ref = requireString(value, name);

    if (!REF.test(ref) || ref.includes('..')) {
        throw new ValidationError(`${name} must be a branch, tag or commit, got ${JSON.stringify(ref)}.`);
    }

    return ref;
}

/** An integer in `[min, max]`, else a ValidationError. */
export function requireInteger(value: unknown, name: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
        throw new ValidationError(`${name} must be an integer from ${min} to ${max}.`);
    }

    return value;
}

/** A non-empty string, else a ValidationError. */
export function requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new ValidationError(`${name} must be a non-empty string.`);
    }

    return value;
}

/** `writeTools({ mergeMethod })`: DEFAULT_MERGE_METHOD when unset, an InvalidAgentDefinitionError outside MERGE_METHODS. */
export function resolveMergeMethod(value: unknown): GithubMergeMethod {
    if (value === undefined) {
        return DEFAULT_MERGE_METHOD;
    }

    if (!(MERGE_METHODS as readonly unknown[]).includes(value)) {
        throw new InvalidAgentDefinitionError(`writeTools: mergeMethod must be one of ${MERGE_METHODS.join(', ')}.`);
    }

    return value as GithubMergeMethod;
}
