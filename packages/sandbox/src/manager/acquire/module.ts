/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { SandboxError, ValidationError } from '@chamvi/core';
import { assertImage } from '../../image/module.ts';
import type { WorkspaceCreateOptions } from '../../provider/types.ts';
import { assertGitRef, normalizeRepo } from '../../repo/module.ts';
import type { IWorkspace } from '../../workspace/types.ts';
import type { WorkspaceCollector } from '../collector/module.ts';
import type { WorkspaceManagerContext } from '../context/module.ts';
import type { WorkspaceEntry } from '../context/types.ts';
import { imageNotOfferedMessage, offersImage, toSandboxError } from '../helpers/index.ts';
import type { WorkspaceLookup } from '../lookup/module.ts';
import type { AcquireInput, AcquireResult } from '../types.ts';

/** The manager's acquire: a held, found or newly created workspace of a run's repository. */
export class WorkspaceAcquire {
    protected readonly ctx: WorkspaceManagerContext;

    protected readonly finder: WorkspaceLookup;

    protected readonly collector: WorkspaceCollector;

    constructor(ctx: WorkspaceManagerContext, finder: WorkspaceLookup, collector: WorkspaceCollector) {
        this.ctx = ctx;
        this.finder = finder;
        this.collector = collector;
    }

    createWorkspace(runId: string, entries: Map<string, WorkspaceEntry>, entry: WorkspaceEntry, input: AcquireInput): Promise<IWorkspace> {
        const { ctx } = this;
        const {
            options,
            rebuild,
            credentials,
        } = ctx;
        const createOptions: WorkspaceCreateOptions = { runId };

        if (entry.key !== '') {
            createOptions.repo = entry.key;
        }

        if (entry.ref !== undefined) {
            createOptions.ref = entry.ref;
        }

        // entry.image is the run's request here (a created or found workspace never comes back)
        const image = entry.image ?? options.image;

        if (image !== undefined) {
            createOptions.image = image;
        }

        if (rebuild.env !== undefined) {
            createOptions.env = { ...rebuild.env };
        }

        if (rebuild.limits !== undefined) {
            createOptions.limits = rebuild.limits;
        }

        createOptions.deployment = ctx.deployment;
        entry.abort = new AbortController();
        createOptions.signal = input.signal === undefined ?
            entry.abort.signal :
            AbortSignal.any([input.signal, entry.abort.signal]);

        return (async () => {
            let workspace: IWorkspace;
            let authenticated: boolean;

            try {
                const credential = createOptions.repo === undefined || !credentials ?
                    undefined :
                    await credentials.lookup(createOptions.repo, 'read', runId, createOptions.signal);

                authenticated = credential !== undefined;

                if (credential || options.depth !== undefined) {
                    createOptions.checkout = {
                        ...(options.depth !== undefined && { depth: options.depth }),
                        ...(credential && { credential }),
                    };
                }

                workspace = await ctx.provider.create(createOptions);
            } catch (error) {
                delete entry.pending;
                delete entry.abort;
                ctx.forget(runId, entry);

                throw toSandboxError(error, 'workspace create failed');
            }

            const released = () => ctx.runs.get(runId) !== entries || entries.get(entry.key) !== entry;

            if (released()) {
                delete entry.pending;
                delete entry.abort;
                // released (run settled, dispose_workspace, close) while the provider created it
                await ctx.disposeOrThrow(workspace).catch(ctx.onError);

                throw new SandboxError('workspace released while it was created; call create_workspace again.');
            }

            entry.workspace = workspace;
            entry.image ??= workspace.info.image;

            // still pending while the credentials are written: a suspension skips it, a release waits for it
            try {
                // an authenticated checkout left its read credential in the file
                await credentials?.refresh(workspace, { fresh: !authenticated });
            } finally {
                delete entry.pending;
                delete entry.abort;
            }

            // released meanwhile: the release disposed it
            if (released()) {
                throw new SandboxError('workspace released while it was created; call create_workspace again.');
            }

            if (workspace.disposed) {
                ctx.forget(runId, entry);

                throw ctx.deadError(workspace);
            }

            return workspace;
        })();
    }

    async acquire(runId: string, input: AcquireInput): Promise<AcquireResult> {
        const { ctx } = this;
        const { options } = ctx;

        if (ctx.closed) {
            throw new SandboxError('the workspace manager is closed.');
        }

        const repo = input.repo === undefined ?
            undefined :
            normalizeRepo(input.repo, { allowFileRepos: options.allowFileRepos, allowRepo: options.allowRepo });
        const { ref } = input;

        if (ref !== undefined) {
            if (repo === undefined) {
                throw new ValidationError('ref needs a repo.');
            }

            assertGitRef(ref);
        }

        const image = input.image === undefined ? undefined : assertImage(input.image);

        if (image !== undefined && !offersImage(options.provider, options.allowImage)) {
            throw new ValidationError(imageNotOfferedMessage(options.provider));
        }

        if (image !== undefined && options.allowImage && !options.allowImage(image)) {
            throw new ValidationError('image not allowed.');
        }

        const key = repo ?? '';

        // a suspension decided before this acquire is stale
        ctx.touch(runId);
        this.collector.maybeCollectGarbage();

        for (const workspace of ctx.sweep(runId).expired) {
            ctx.disposeInBackground(workspace);
        }

        const reuse = async (existing: WorkspaceEntry): Promise<AcquireResult> => {
            if (existing.ref !== ref) {
                throw new SandboxError(`This run already has a workspace of ${repo ?? 'no repository'} at ${existing.ref ?? 'the default branch'}; ` +
                    `dispose it first (dispose_workspace) to check out ${ref ?? 'the default branch'}.`);
            }

            if (image === undefined || existing.image === image) {
                return { workspace: existing.workspace ?? await existing.pending!, reused: true };
            }

            const refuse = (held: string) => new SandboxError(`This run already has a workspace of ${repo ?? 'no repository'} ` +
                `on the image ${held}; dispose it first (dispose_workspace) to use ${image}.`);

            if (existing.image !== undefined) {
                throw refuse(existing.image);
            }

            // a create without a request learns its image once it lands; a
            // workspace that records none (local) takes any request
            const workspace = existing.workspace ?? await existing.pending!;

            if (workspace.info.image !== undefined && workspace.info.image !== image) {
                throw refuse(workspace.info.image);
            }

            return { workspace, reused: true };
        };

        const held = ctx.runs.get(runId)?.get(key);

        if (held) {
            return reuse(held);
        }

        // another process (a replica, or this one before a restart) may hold it
        await this.finder.lookup(runId);

        if (ctx.closed) {
            throw new SandboxError('the workspace manager is closed.');
        }

        let entries = ctx.runs.get(runId);
        const existing = entries?.get(key);

        if (existing) {
            return reuse(existing);
        }

        const { maxPerRun } = ctx;

        if (entries && entries.size >= maxPerRun) {
            throw new SandboxError(`A run holds at most ${maxPerRun} workspace${maxPerRun === 1 ? '' : 's'}; dispose one first ` +
                '(dispose_workspace), or have the operator raise maxWorkspacesPerRun of the workspace manager.');
        }

        if (!entries) {
            entries = new Map();
            ctx.runs.set(runId, entries);
        }

        const entry: WorkspaceEntry = { key, ref };

        if (image !== undefined) {
            entry.image = image;
        }

        entries.set(key, entry);
        entry.pending = this.createWorkspace(runId, entries, entry, input);

        return { workspace: await entry.pending, reused: false };
    }
}
