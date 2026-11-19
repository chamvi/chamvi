/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    SandboxError,
    ValidationError,
    systemClock,
} from '@chamvi/core';
import type { IWorkspace } from '../workspace/types.ts';
import { InstructionCollector } from './collector.ts';
import { INSTRUCTION_REQUEST_TIMEOUT_MS } from './constants.ts';
import { DeadlineSignal } from './deadline.ts';
import { createDiagnosticList } from './helpers/index.ts';
import type { ReadRepositoryInstructionsOptions, RepositoryInstructions } from './types.ts';

/**
 * Reads the development instructions of a repository workspace for
 * `paths` (default the root): per directory from the root down to each
 * path, `AGENTS.md` then `CLAUDE.md`, each followed depth first by the
 * files its standalone `@path` lines include. Everything goes through
 * `workspace.exec` with a fixed script (no host path, no repository
 * program); symbolic links, special files and `.git` are refused whenever
 * observed, which is a best-effort check, not a guarantee against a
 * concurrent change. A source is returned whole or omitted with a
 * diagnostic; a transport failure, a malformed answer or an abort rejects
 * with a SandboxError instead of reading as no instructions.
 */
export async function readRepositoryInstructions(
    workspace: IWorkspace,
    paths?: readonly string[],
    options: ReadRepositoryInstructionsOptions = {},
): Promise<RepositoryInstructions> {
    const { signal } = options;
    const clock = options.clock ?? systemClock;
    const deadline = clock.now() + INSTRUCTION_REQUEST_TIMEOUT_MS;
    const redact = (text: string) => (workspace.redact ? workspace.redact(text) : text);
    const diagnostics = createDiagnosticList(redact);
    const requested = paths ?? ['.'];

    if (!Array.isArray(requested)) {
        throw new ValidationError('paths must be a list of workspace paths.');
    }

    const collector = new InstructionCollector({
        workspace,
        clock,
        signal,
        deadline,
        redact,
        diagnostics,
        requested,
    });
    const { expiry, sources } = collector;
    const commit = workspace.info.commit ?? null;
    const timer = clock.setTimeout(() => expiry.abort(), INSTRUCTION_REQUEST_TIMEOUT_MS);

    timer.unref?.();

    try {
        await collector.collect();
    } catch (error) {
        if (!(error instanceof DeadlineSignal)) {
            throw error;
        }

        collector.stop(`The request took longer than ${INSTRUCTION_REQUEST_TIMEOUT_MS / 1000} s; the rest was skipped.`);
    } finally {
        timer.clear();
    }

    if (signal?.aborted) {
        throw new SandboxError('Repository instruction discovery aborted.');
    }

    const redactedPaths = collector.paths.map(redact);
    const redactedSources = sources.map((source) => ({
        ...source,
        path: redact(source.path),
        scopes: source.scopes.map(redact),
        includedBy: source.includedBy.map(redact),
    }));

    if (expiry.signal.aborted || clock.now() >= deadline) {
        collector.stop(`The request took longer than ${INSTRUCTION_REQUEST_TIMEOUT_MS / 1000} s; the rest was skipped.`);
    }

    return {
        commit,
        paths: redactedPaths,
        sources: redactedSources,
        diagnostics: diagnostics.entries,
        complete: diagnostics.entries.length === 0,
    };
}
