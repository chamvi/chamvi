/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ChamviError, InvalidAgentDefinitionError } from '@chamvi/core';
import { isDiagnostic } from 'skills';
import { SKILL_PREPARATION_FAILED_ERROR_CODE, SKILL_PREPARATION_LOCKED_ERROR_CODE } from './constants.ts';
import type { PrepareSkillsOptions } from './types.ts';

// eslint-disable-next-line no-control-regex
const controls = /[\x00-\x1f\x7f]/u;

export function invalid(): never {
    throw new InvalidAgentDefinitionError('Cannot prepare skills: invalid configuration, source, verification or managed directory.');
}

// The SDK reports a repository a host denies or does not have as SKILLS_GIT_AUTH_FAILED only when git
// says "Repository not found"; a missing file://, ssh path or plain https repository arrives as
// SKILLS_GIT_CLONE_FAILED, so this narrow check of git's answer keeps those deterministic failures
// configuration. A missing ref (also SKILLS_GIT_CLONE_FAILED) never matches it and stays retryable.
const missingRepository = /does not appear to be a git repository|fatal: repository '[^']*' not found|returned error: 404/u;

// Inline refs (`#ref`, `/tree/<ref>`, `/-/tree/<ref>`) and skill filters (`owner/repo@skill`) are refused:
// the pin is `revision` and the selection is `names`. `<transport>::` remote helpers (`ext::`) are refused too.
const inlineRef = /#|\/tree\//u;
const skillFilter = /^(?:github:|gitlab:)?[^/:@]+\/[^/@]+@/u;
const remoteHelper = /^[a-z][a-z0-9+.-]*::/iu;

/** A local path, as the SDK reads one (absolute, `./`, `../`, `.`, `..`); `~` is not expanded. */
function isLocalPath(source: string): boolean {
    return isAbsolute(source) || source === '.' || source === '..' || source.startsWith('./') || source.startsWith('../');
}

/** A retryable failure: generic, since SDK and git messages can hold credentials or private content. */
export function unavailable(): never {
    throw new ChamviError({
        code: SKILL_PREPARATION_FAILED_ERROR_CODE,
        message: 'Cannot prepare skills: the source could not be fetched or the managed directory could not be written; the preparation can be retried.',
    });
}

export function locked(guard: string): never {
    throw new ChamviError({
        code: SKILL_PREPARATION_LOCKED_ERROR_CODE,
        message: `Cannot prepare skills: another preparation holds the guard ${guard}. ` +
            'A guard whose process is gone (on this host) or older than the stale bound is recovered on the next attempt.',
    });
}

/**
 * Maps a preparation failure to the configuration error (`invalid()`: a check
 * refused the input, an authentication failure, a missing repository, a source
 * or selection the SDK refused), the lock error, or else a retryable failure
 * (`unavailable()`): a pinned commit the SDK could not fetch is retryable,
 * since its answer hides the cause, as is every unknown SDK code.
 */
export function toPreparationError(error: unknown): never {
    if (error instanceof ChamviError && error.code === SKILL_PREPARATION_LOCKED_ERROR_CODE) {
        throw error;
    }

    if (error instanceof InvalidAgentDefinitionError) {
        invalid();
    }

    if (isDiagnostic(
        error,
        'SKILLS_GIT_AUTH_FAILED',
        'SKILLS_GIT_SAML_SSO_BLOCKED',
        'SKILLS_UNSUPPORTED_GIT_TRANSPORT',
        'SKILLS_INVALID_OPTION_VALUE',
        'SKILLS_LOCAL_PATH_NOT_FOUND',
        'SKILLS_NO_VALID_SKILLS',
        'SKILLS_NO_MATCHING_SKILLS',
        'SKILLS_AMBIGUOUS_SKILL_SELECTOR',
        'SKILLS_DUPLICATE_SKILL_NAME',
        'SKILLS_SKILL_CONTAINS_SYMLINKS',
    )) {
        invalid();
    }

    // git's own answer (the cause), not the message, which embeds the source URL
    if (isDiagnostic(error, 'SKILLS_GIT_CLONE_FAILED') && Error.isError(error.cause) && missingRepository.test(error.cause.message)) {
        invalid();
    }

    return unavailable();
}

export function copyPreparationOptions(options: PrepareSkillsOptions) {
    if (!options) {
        invalid();
    }

    if (typeof options.source !== 'string' || !options.source.trim() || controls.test(options.source)) {
        invalid();
    }

    if (typeof options.revision !== 'string' || !/^[a-f0-9]{40}$/iu.test(options.revision)) {
        invalid();
    }

    if (!Array.isArray(options.names) || !options.names.length) {
        invalid();
    }

    if (typeof options.directory !== 'string' || !options.directory.trim() || controls.test(options.directory)) {
        invalid();
    }

    if (options.verify !== undefined && typeof options.verify !== 'function') {
        invalid();
    }

    const {
        source,
        verify,
        signal,
    } = options;
    const revision = options.revision.toLowerCase();
    const names = [...options.names];

    for (const name of names) {
        if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(name)) {
            invalid();
        }
    }

    if (new Set(names).size !== names.length) {
        invalid();
    }

    const requestedDirectory = resolve(options.directory);

    if (dirname(requestedDirectory) === requestedDirectory) {
        invalid();
    }

    // The SDK accepts a ref only for git sources: a local path goes to it as a file URL, which it clones.
    const local = isLocalPath(source);

    if (!local && (inlineRef.test(source) || skillFilter.test(source) || remoteHelper.test(source))) {
        invalid();
    }

    return {
        source: local ? pathToFileURL(resolve(source)).href : source,
        revision,
        names,
        requestedDirectory,
        verify,
        signal,
    };
}

let quieting = 0;
let emitWarning: typeof process.emitWarning | undefined;
let quiet: typeof process.emitWarning | undefined;

/**
 * Runs an SDK call while process warnings named `YAMLWarning` are dropped. The SDK parses each
 * `SKILL.md` frontmatter with `yaml`'s default log level, so a warning such as an unresolved tag goes
 * through `process.emitWarning` with a quote of the source text; the SDK's `onWarning` does not see it.
 * Other warnings pass through. Overlapping calls share one filter, which the last one to settle
 * restores unless someone replaced `process.emitWarning` meanwhile.
 */
export async function withoutYamlWarnings<T>(task: () => Promise<T>): Promise<T> {
    if (quieting === 0) {
        const original = process.emitWarning;

        emitWarning = original;
        quiet = function (this: unknown, warning: string | Error, ...rest: unknown[]) {
            if (Error.isError(warning) && warning.name === 'YAMLWarning') {
                return;
            }

            Reflect.apply(original, process, [warning, ...rest]);
        } as typeof process.emitWarning;
        process.emitWarning = quiet;
    }

    quieting++;

    try {
        return await task();
    } finally {
        quieting--;

        if (quieting === 0) {
            if (process.emitWarning === quiet) {
                process.emitWarning = emitWarning!;
            }

            emitWarning = undefined;
            quiet = undefined;
        }
    }
}

/** Whether `error` is the caller's own cancellation: its abort reason, or an `ABORT_ERR` caused by it. */
export function isCancellation(error: unknown, signal: AbortSignal | undefined): boolean {
    if (!signal?.aborted) {
        return false;
    }

    if (error === signal.reason) {
        return true;
    }

    return Error.isError(error) && 'code' in error && error.code === 'ABORT_ERR' && error.cause === signal.reason;
}
