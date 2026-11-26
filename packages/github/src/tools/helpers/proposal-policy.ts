/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { matchesGlob } from 'node:path';
import type { ToolExecutionOptions } from 'ai';
import { ValidationError } from '@chamvi/errors';
import type { ToolContext } from '@chamvi/core';
import type { GithubProposalsOptions } from '../../app/types.ts';
import type { GithubProposeChangeInput, RepoTarget } from '../types.ts';
import { parseRepo, requireString } from './input.ts';
import { stepOf } from './step.ts';
import { hasFooterMarker } from './text.ts';

/** Root folders whose files steer CI, hooks or review, refused whatever the allowlist says. */
const FORBIDDEN_ROOTS = new Set(['.github', '.husky']);

/** File names refused in any folder: review ownership and submodule targets. */
const FORBIDDEN_NAMES = new Set(['codeowners', '.gitmodules']);

/**
 * No normalization: accepting a different spelling could bypass the allowlist or target a different file.
 * Unicode format characters (category Cf: bidi overrides, zero-width joiners) are refused, since they
 * make a path (and the PR title built from it) read differently from what GitHub writes.
 */
export function safePath(path: string): boolean {
    const printable = Array.from(path).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127);
    const parts = path.split('/');

    return path.length > 0 && path.trim() === path && printable &&
        !/\p{Cf}/u.test(path) &&
        !/[\\%:#?]/.test(path) &&
        parts.every((part) => part !== '' && part !== '.' && part !== '..') &&
        !FORBIDDEN_ROOTS.has(parts[0]!.toLowerCase()) &&
        parts.every((part) => !FORBIDDEN_NAMES.has(part.toLowerCase()));
}

export function allowedPath(path: string, repo: string, policy: GithubProposalsOptions): boolean {
    return typeof path === 'string' && safePath(path) &&
        (policy.repos[repo.toLowerCase()]?.paths.some((pattern) => matchesGlob(path, pattern)) ?? false);
}

export function validateProposal(input: GithubProposeChangeInput, policy: GithubProposalsOptions): RepoTarget {
    const target = parseRepo(input.repo);
    const allowed = allowedPath(input.path, input.repo, policy);

    if (!allowed) {
        throw new ValidationError('Proposal repository/path is not allowed (unsafe paths, .github, .husky, CODEOWNERS and .gitmodules are always forbidden).');
    }

    if (typeof input.content !== 'string') {
        throw new ValidationError('content must be a string.');
    }

    requireString(input.reason, 'reason');

    return target;
}

/**
 * One effect per run, repository, path, content and model step: a corrected proposal
 * (another content for the same path) is a new effect, never the recorded first one,
 * and so is a later step returning to an earlier content (A, B, A), which must write A
 * again instead of answering with A's first record while the branch holds B.
 */
export function proposalKey(
    input: GithubProposeChangeInput,
    ctx: ToolContext,
    options: Pick<ToolExecutionOptions<unknown>, 'toolCallId' | 'messages'>,
): string {
    const content = createHash('sha256').update(input.content).digest('hex');

    return `${ctx.run.runId}:propose:${input.repo.toLowerCase()}:${input.path}:${content}:${stepOf(options)}`;
}

export function branchMarker(branch: string): string {
    return `<!-- chamvi:proposal=${branch} -->`;
}

/** The tool-owned footer of a proposal body or commit message: the branch marker, then an effect marker, last. */
export function hasProposalFooter(text: string | null | undefined, branch: string): boolean {
    if (typeof text !== 'string') {
        return false;
    }

    const lines = text.trimEnd().split('\n');
    const effect = lines.at(-1) ?? '';

    return lines.length >= 3 && lines.at(-2) === branchMarker(branch) &&
        effect.startsWith('<!-- chamvi:effect=') && effect.endsWith(' -->');
}

/** The tool-owned footer naming exactly this effect; a marker quoted in the model-written `reason` never counts. */
export function hasEffectFooter(text: string | null | undefined, branch: string, effect: string): boolean {
    return hasFooterMarker(text, `${branchMarker(branch)}\n${effect}`);
}

export function proposalBranch(input: GithubProposeChangeInput, ctx: ToolContext): string {
    const slug = input.path.toLowerCase().replaceAll(/[^a-z0-9-]+/g, '-').slice(0, 80).replaceAll(/^-+|-+$/g, '') || 'file';
    const hash = createHash('sha256').update(input.path).digest('hex').slice(0, 16);
    const { agent } = ctx.run;

    return `chamvi/${agent}/${slug}-${hash}`;
}
