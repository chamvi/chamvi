/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/errors';
import type { ToolContext } from '@chamvi/core';
import type { GithubOctokit, IGithubApp } from '../../app/types.ts';
import { GITHUB_REQUEST_ERROR_CODE } from '../constants.ts';
import type { RepoTarget } from '../types.ts';
import { installationOf } from './installation.ts';

/** The HTTP status of an Octokit RequestError, else undefined. */
export function statusOf(error: unknown): number | undefined {
    if (Error.isError(error) && error.name === 'HttpError' && typeof (error as { status?: unknown }).status === 'number') {
        return (error as unknown as { status: number }).status;
    }

    return undefined;
}

/**
 * What a tool throws for a failed GitHub call: `GitHub <status>: <message>`,
 * never the request (an Octokit RequestError carries its headers).
 * chamvi errors (FatalToolError, ValidationError) pass through.
 */
export function toolError(error: unknown): Error {
    if (error instanceof ChamviError) {
        return error;
    }

    const status = statusOf(error);
    const message = Error.isError(error) ? error.message : String(error);

    return new ChamviError({
        message: status !== undefined ? `GitHub ${status}: ${message}` : `GitHub request failed: ${message}`,
        code: GITHUB_REQUEST_ERROR_CODE,
    });
}

/** Binds every request of `octokit` to `signal` (cancel, drain and the run timeout abort a stalled GitHub call). */
export function bindSignal(octokit: GithubOctokit, signal: AbortSignal): GithubOctokit {
    octokit.hook.before('request', (options) => {
        options.request = { ...options.request, signal };
    });

    return octokit;
}

/**
 * `promise`, or a rejection with the signal's reason once it aborts. For a
 * shared request (the single-flight installation lookup) one caller's
 * signal must not abort, so the caller only stops waiting.
 */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        // The operation may have aborted the signal synchronously; still observe its rejection.
        void promise.catch(() => {});

        return Promise.reject(signal.reason);
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);

        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

/**
 * Runs `fn` with the Octokit of the installation `installationOf()`
 * resolves for `target`, every request bound to the run's signal; every
 * failure through `toolError`.
 */
export async function withOctokit<T>(
    app: IGithubApp,
    ctx: ToolContext,
    target: RepoTarget | undefined,
    fn: (octokit: GithubOctokit) => Promise<T>,
): Promise<T> {
    try {
        const { signal } = ctx.run;
        const installationId = await untilAborted(installationOf(app, ctx, target), signal);
        const octokit = bindSignal(await app.octokit(installationId), signal);

        return await fn(octokit);
    } catch (error) {
        throw toolError(error);
    }
}
