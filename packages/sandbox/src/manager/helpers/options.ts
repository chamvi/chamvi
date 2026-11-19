/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import type { IGitCredentials } from '../../credentials/types.ts';
import { assertSandboxEnv, resolveLimits } from '../../limits/module.ts';
import { assertDeployment, assertImageOption } from '../../provider/module.ts';
import { GC_INTERVAL_MAX_MS } from '../constants.ts';
import type { GitAuthor, PushPolicy, WorkspaceManagerOptions } from '../types.ts';

/** Checks the manager options; InvalidAgentDefinitionError for a misconfiguration. */
export function assertManagerOptions(options: WorkspaceManagerOptions): void {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError('createWorkspaceManager() needs an options object.');
    }

    const { provider } = options;

    if (
        !isObject(provider) ||
        typeof provider.create !== 'function' ||
        typeof provider.find !== 'function' ||
        typeof provider.collectGarbage !== 'function'
    ) {
        throw new InvalidAgentDefinitionError('provider must be an ISandboxProvider (create, find, collectGarbage).');
    }

    if (options.deployment !== undefined) {
        try {
            assertDeployment(options.deployment);
        } catch (error) {
            throw new InvalidAgentDefinitionError((error as Error).message);
        }
    }

    if (options.isSettled !== undefined && typeof options.isSettled !== 'function') {
        throw new InvalidAgentDefinitionError('isSettled must be a function.');
    }

    if (options.isSuspendable !== undefined && typeof options.isSuspendable !== 'function') {
        throw new InvalidAgentDefinitionError('isSuspendable must be a function.');
    }

    assertImageOption(options.image);
    assertSandboxEnv(options.env);
    resolveLimits(options.limits);

    if (options.allowRepo !== undefined && typeof options.allowRepo !== 'function') {
        throw new InvalidAgentDefinitionError('allowRepo must be a function.');
    }

    if (options.allowImage !== undefined && typeof options.allowImage !== 'function') {
        throw new InvalidAgentDefinitionError('allowImage must be a function.');
    }

    if (options.repositoryInstructions !== undefined && typeof options.repositoryInstructions !== 'boolean') {
        throw new InvalidAgentDefinitionError('repositoryInstructions must be a boolean.');
    }

    if (options.maxWorkspacesPerRun !== undefined && (!Number.isSafeInteger(options.maxWorkspacesPerRun) || options.maxWorkspacesPerRun < 1)) {
        throw new InvalidAgentDefinitionError(`maxWorkspacesPerRun must be an integer of at least 1, got ${JSON.stringify(options.maxWorkspacesPerRun)}.`);
    }

    if (options.gcIntervalMs !== undefined && (
        !Number.isSafeInteger(options.gcIntervalMs) ||
        options.gcIntervalMs < 0 ||
        options.gcIntervalMs > GC_INTERVAL_MAX_MS
    )) {
        // a Node timer above 2^31 - 1 fires after 1 ms, so the collector would run back to back
        throw new InvalidAgentDefinitionError(`gcIntervalMs must be an integer from 0 to ${GC_INTERVAL_MAX_MS}, got ${JSON.stringify(options.gcIntervalMs)}.`);
    }

    if (options.onError !== undefined && typeof options.onError !== 'function') {
        throw new InvalidAgentDefinitionError('onError must be a function.');
    }

    if ('credentialMode' in options) {
        // removed in 0.4: silently ignoring it would hand bash the write token a `tools` deployment kept out
        throw new InvalidAgentDefinitionError('credentialMode was removed in 0.4: workspace-installed credentials are the only mode; drop the option (see the upgrade guide).');
    }

    credentialSources(options.credentials);

    if (options.depth !== undefined && (!Number.isSafeInteger(options.depth) || options.depth < 1)) {
        throw new InvalidAgentDefinitionError('depth must be an integer of at least 1.');
    }

    authorEnv(options.author);
    assertPushPolicy(options.push);
}

/** The credential sources as a list, else InvalidAgentDefinitionError. */
export function credentialSources(credentials: WorkspaceManagerOptions['credentials']): IGitCredentials[] {
    if (credentials === undefined) {
        return [];
    }

    const sources = Array.isArray(credentials) ? credentials : [credentials];

    const hasInvalidSource = sources.some((source) => !isObject(source) || typeof (source as Partial<IGitCredentials>).get !== 'function');

    if (hasInvalidSource) {
        throw new InvalidAgentDefinitionError('credentials must be git credential sources (an object with get()), or a list of them.');
    }

    return sources;
}

/** The `GIT_AUTHOR_*`/`GIT_COMMITTER_*` variables of `author`, else InvalidAgentDefinitionError. */
export function authorEnv(author: GitAuthor | undefined): Record<string, string> {
    if (author === undefined) {
        return {};
    }

    const valid = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && !/[\0\r\n<>]/.test(value);

    if (!isObject(author) || !valid(author.name) || !valid(author.email)) {
        throw new InvalidAgentDefinitionError('author must be { name, email }: non-empty strings without NUL, line breaks, < or >.');
    }

    return {
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
    };
}

function assertPushPolicy(push: PushPolicy | undefined): void {
    if (push === undefined) {
        return;
    }

    const fail = (rule: string) => new InvalidAgentDefinitionError(`push ${rule}`);

    if (!isObject(push)) {
        throw fail('must be an object { mode?, allowForce?, allowBranch?, channel? }.');
    }

    if (push.mode !== undefined && push.mode !== 'auto' && push.mode !== 'approve') {
        throw fail('mode must be "auto" or "approve".');
    }

    if (push.allowForce !== undefined && typeof push.allowForce !== 'boolean') {
        throw fail('allowForce must be a boolean.');
    }

    if (push.allowBranch !== undefined && typeof push.allowBranch !== 'function') {
        throw fail('allowBranch must be a function.');
    }

    if (push.channel !== undefined && (typeof push.channel !== 'string' || push.channel.length === 0)) {
        throw fail('channel must be a non-empty channel name.');
    }
}
