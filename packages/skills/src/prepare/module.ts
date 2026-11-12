/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import fs from 'node:fs/promises';
import {
    basename,
    dirname,
    join,
    resolve,
} from 'node:path';
import { installSkills, resolveSource } from 'skills';
import type { SkillSource } from 'skills';
import type { PrepareSkillsOptions, PreparedSkill } from './types.ts';
import {
    copyPreparationOptions,
    invalid,
    isCancellation,
    toPreparationError,
    unavailable,
    withoutYamlWarnings,
} from './helpers.ts';
import { acquireGuard, releaseGuard } from './lock.ts';

const marker = '.chamvi-skills';
const ownership = 'chamvi-skills-v1\n';
const gitSourceTypes = ['git', 'github', 'gitlab'];

async function inspectTarget(directory: string): Promise<boolean> {
    const stat = await fs.lstat(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
            return undefined;
        }

        throw error;
    });

    if (!stat) {
        return false;
    }

    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        invalid();
    }

    const entries = await fs.readdir(directory);

    if (entries.length) {
        const file = join(directory, marker);
        // no ownership marker: the target is not ours
        const identity = await fs.lstat(file).catch(() => invalid());

        if (!identity.isFile() || identity.size !== ownership.length || await fs.readFile(file, 'utf8') !== ownership) {
            invalid();
        }
    }

    return true;
}

/**
 * Prepare a dedicated corpus during setup/build; the caller owns source selection and content approval.
 * Rejects with `InvalidAgentDefinitionError` for configuration (options, pin, source content, authentication,
 * a missing repository, an unowned target), with `SKILL_PREPARATION_LOCKED_ERROR_CODE` while another
 * preparer holds the target's guard, and with `SKILL_PREPARATION_FAILED_ERROR_CODE` for retryable failures.
 */
export async function prepareSkills(options: PrepareSkillsOptions): Promise<readonly PreparedSkill[]> {
    const {
        revision,
        names,
        requestedDirectory,
        verify,
        signal,
        source,
    } = copyPreparationOptions(options);

    signal?.throwIfAborted();

    let handle: SkillSource | undefined;
    let stage: string | undefined;
    let lock: { guard: string; token: string } | undefined;
    let previous: string | undefined;
    let result: readonly PreparedSkill[];
    let failed = false;

    try {
        await fs.mkdir(dirname(requestedDirectory), { recursive: true });
        signal?.throwIfAborted();

        const parent = await fs.realpath(dirname(requestedDirectory));

        signal?.throwIfAborted();

        const directory = join(parent, basename(requestedDirectory));
        const guard = join(parent, `.${basename(directory)}.chamvi-skills-lock`);

        // a guard a crashed preparer left is recovered (its process is gone here, or it is older than the bound)
        lock = { guard, token: await acquireGuard(guard) };
        signal?.throwIfAborted();
        await inspectTarget(directory);
        signal?.throwIfAborted();
        stage = await fs.mkdtemp(join(parent, '.chamvi-skills-'));
        signal?.throwIfAborted();
        // No `onWarning`: the SDK then drops source diagnostics, which can hold private YAML excerpts.
        // The SDK does not interrupt a running clone; it is joined, then disposed, before a cancellation rejects.
        // Discovery reads the SDK's standard locations (root, `skills/`, agent and plugin folders) and the
        // whole tree only when those hold nothing, so skills inside vendored copies or submodules stay out.
        handle = await withoutYamlWarnings(() => resolveSource(source, {
            ref: revision,
            includeInternal: true,
            signal,
        }));
        signal?.throwIfAborted();

        if (!gitSourceTypes.includes(handle.source.type) || handle.source.commit !== revision) {
            invalid();
        }

        const staged: PreparedSkill[] = [];

        for (const name of names) {
            signal?.throwIfAborted();

            // exactly one folder declares the name: a duplicate or only a fuzzy match is ambiguous
            const matches = handle.skills.filter((skill) => skill.name === name);

            if (matches.length !== 1 || matches[0]!.duplicates?.length) {
                invalid();
            }

            const skill = matches[0]!;
            const checkout = handle;
            const installed = await withoutYamlWarnings(() => installSkills(checkout, {
                cwd: stage,
                skills: [name],
                agents: ['universal'],
                mode: 'copy',
                lockfile: false,
                telemetry: false,
                duplicates: 'error',
                symlinks: 'reject',
                signal,
            }));

            signal?.throwIfAborted();

            const path = join(stage, '.agents', 'skills', name);

            if (installed.failed.length || installed.skipped.length || installed.installed.length !== 1 ||
                resolve(installed.installed[0]!.path) !== path) {
                invalid();
            }

            const stat = await fs.lstat(path).catch(() => invalid());

            if (!stat.isDirectory()) {
                invalid();
            }

            const prepared = Object.freeze({
                name,
                description: skill.description,
                path,
            });

            // the caller's own cancellation stays a cancellation; any other verifier failure is a refusal
            const verdict = await (async () => verify?.(prepared))().catch((error: unknown) => {
                if (isCancellation(error, signal)) {
                    throw error;
                }

                return invalid();
            });

            if (verdict !== undefined) {
                invalid();
            }

            signal?.throwIfAborted();
            staged.push(prepared);
        }

        const corpus = join(stage, '.agents', 'skills');

        await fs.writeFile(join(corpus, marker), ownership, { flag: 'wx' });

        const exists = await inspectTarget(directory);

        signal?.throwIfAborted();

        // Complete promotion and rollback without cancellation interrupting ownership.
        if (exists) {
            const backup = join(stage, 'previous');

            await fs.rename(directory, backup);
            previous = backup;
        }

        try {
            await fs.rename(corpus, directory);
        } catch (error) {
            if (previous) {
                await fs.rename(previous, directory);
                previous = undefined;
            }

            throw error;
        }

        previous = undefined;
        result = Object.freeze(staged.map((skill) => Object.freeze({ ...skill, path: join(requestedDirectory, skill.name) })));
    } catch (error) {
        failed = true;

        if (isCancellation(error, signal)) {
            throw signal!.reason;
        }

        return toPreparationError(error);
    } finally {
        // Keep a backup if restoring the previous corpus itself failed.
        const cleanups = [
            handle?.dispose(),
            stage && !previous && fs.rm(stage, { recursive: true, force: true }),
            lock && releaseGuard(lock.guard, lock.token),
        ];
        const settled = await Promise.allSettled(cleanups);

        const hasRejectedCleanup = settled.some((result) => result.status === 'rejected');

        // a cleanup failure never replaces the error of a failed preparation (configuration, cancellation)
        if (hasRejectedCleanup && !failed) {
            unavailable();
        }
    }

    signal?.throwIfAborted();

    return result;
}
