/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ClockTimer } from '@chamvi/core';
import { InvalidAgentDefinitionError, SandboxError } from '@chamvi/core';
import type { ToolSet } from 'ai';
import { normalizeRepo } from '../repo/module.ts';
import type { IWorkspace } from '../workspace/types.ts';
import { WorkspaceAcquire } from './acquire/module.ts';
import { WorkspaceCollector } from './collector/module.ts';
import { CLOSE_TIMEOUT_MS } from './constants.ts';
import { WorkspaceManagerContext } from './context/module.ts';
import { createGitTools } from './git-tools.ts';
import { assertManagerOptions, isTerminal, offersImage } from './helpers/index.ts';
import { WorkspaceLookup } from './lookup/module.ts';
import { WorkspaceRelease } from './release/module.ts';
import { createWorkspaceTools } from './tools.ts';
import type { CloseOptions, IWorkspaceManager, WorkspaceManagerOptions } from './types.ts';

/**
 * Run-scoped workspaces over `provider`: one per (run, repository), created
 * on `acquire`, disposed on `release`, on expiry (checked on every get), when
 * the run settles (`attach`, also the ones another process created: through
 * `provider.find` for a run this process touched, else with `isSettled`
 * through the next garbage collection) and by garbage collection. A
 * workspace found gone (`IWorkspace.disposed`: its container or pod stopped
 * or was removed, its directory vanished) is forgotten, never disposed, since
 * a dispose would remove a stopped container with its work. On a miss, also
 * after such a forget, the manager asks `provider.find` (one lookup per run
 * at a time) and adopts what it finds, so a run reaches its workspaces after
 * a restart, a daemon restart or on another replica. `close()` disposes
 * nothing a live run holds. A run can only ever reach its own workspaces.
 */
export function createWorkspaceManager(options: WorkspaceManagerOptions): IWorkspaceManager {
    assertManagerOptions(options);

    const ctx = new WorkspaceManagerContext(options);
    const {
        runs,
        lookups,
        suspended,
        disposals,
        releasedCreates,
        credentials,
        clock,
        isSettled,
        onError,
    } = ctx;
    const subscriptions = new Set<() => void>();
    let tools: ToolSet | undefined;

    const finder = new WorkspaceLookup(ctx);
    const releaser = new WorkspaceRelease(ctx);
    const collector = new WorkspaceCollector(ctx, releaser);
    const acquirer = new WorkspaceAcquire(ctx, finder, collector);

    const release = (runId: string, workspaceId?: string): Promise<void> => releaser.release(runId, workspaceId);
    const collectGarbage = (): Promise<number> => collector.collectGarbage();
    const maybeCollectGarbage = (): void => collector.maybeCollectGarbage();
    const disposeOrThrow = (workspace: IWorkspace): Promise<void> => ctx.disposeOrThrow(workspace);

    const attach = (engine: Parameters<IWorkspaceManager['attach']>[0]): () => void => {
        // a closed manager holds nothing and acquires nothing: nothing to dispose
        if (ctx.closed) {
            return () => {};
        }

        const off = engine.on('run.updated', ({ run }) => {
            if (!isTerminal(run.status)) {
                return;
            }

            if (isSettled && !runs.has(run.id) && !lookups.has(run.id) && !suspended.has(run.id)) {
                // never touched here: no lookup per settled run (a container or
                // pod list each); another process's leftovers go with the next
                // collection (isSettled), at most one per gcIntervalMs
                maybeCollectGarbage();

                return;
            }

            release(run.id).catch(onError);
        });
        let active = true;
        const unsubscribe = () => {
            if (!active) {
                return;
            }

            active = false;
            subscriptions.delete(unsubscribe);
            off();
        };

        subscriptions.add(unsubscribe);

        return unsubscribe;
    };

    /** What the manager hands out: with credentials the redacting, refreshing view of a workspace. */
    const handOut = (workspace: IWorkspace): IWorkspace => (credentials ? credentials.wrap(workspace) : workspace);
    const redacting = <T>(run: () => Promise<T>): Promise<T> => (credentials ?
        run().catch((error: unknown) => {
            throw credentials.redactor.redactError(error);
        }) :
        run());

    const manager: IWorkspaceManager = {
        acquire: (runId, input) => redacting(async () => {
            const result = await acquirer.acquire(runId, input);

            return { ...result, workspace: handOut(result.workspace) };
        }),
        get: (runId, workspaceId) => redacting(async () => handOut(await finder.get(runId, workspaceId))),
        release,
        dispose: (runId, workspaceId) => redacting(() => releaser.disposeOne(runId, workspaceId)),
        attach,
        tools: () => {
            tools ??= {
                ...createWorkspaceTools(manager, {
                    image: offersImage(options.provider, options.allowImage),
                    repositoryInstructions: options.repositoryInstructions !== false,
                }),
                ...createGitTools({
                    manager,
                    lookup: async (url, access, runId, signal) => credentials?.lookup(url, access, runId, signal),
                    normalize: (repo) => normalizeRepo(repo, { allowFileRepos: options.allowFileRepos, allowRepo: options.allowRepo }),
                    push: options.push ?? {},
                }),
            };

            return tools;
        },
        collectGarbage,
        async close(closeOptions: CloseOptions = {}) {
            const timeoutMs = closeOptions?.timeoutMs ?? CLOSE_TIMEOUT_MS;

            if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
                throw new InvalidAgentDefinitionError(`close() timeoutMs must be an integer of at least 0, got ${JSON.stringify(timeoutMs)}.`);
            }

            ctx.closed = true;

            for (const unsubscribe of [...subscriptions]) {
                unsubscribe();
            }

            // what is still being disposed or created, for the timeout report:
            // one key per item, as several items of a run share a label
            const left = new Map<object, string>();
            const track = (labels: string[], promise: Promise<unknown>): Promise<unknown> => {
                const keys = labels.map((label) => {
                    const key = {};

                    left.set(key, label);

                    return key;
                });

                return promise.finally(() => {
                    for (const key of keys) {
                        left.delete(key);
                    }
                });
            };
            // disposals started before (a settled run, an expired or gone
            // workspace): their runs are no longer held, but their containers
            // must not outlive the close
            const started = disposals.entries().toArray()
                .map(([disposal, id]) => track([id], disposal.catch(() => undefined)));
            // creates in flight of runs released before (attach): their
            // abort cleanup or the dispose of what they got anyway
            const creating = releasedCreates.entries().toArray()
                .map(([pending, label]) => track([label], pending));
            // the workspaces of live runs stay (their runs resume after a
            // restart or on another replica and find them) unless `dispose`;
            // creates in flight are aborted and what they made anyway is disposed
            const work = runs.entries().toArray().flatMap(([runId, entries]) => entries.values().toArray()
                .flatMap((entry) => {
                    if (entry.workspace) {
                        if (!closeOptions.dispose) {
                            return [];
                        }

                        const { workspace } = entry;

                        return [track([`workspace ${workspace.id} of run ${runId}`], disposeOrThrow(workspace).catch(onError))];
                    }

                    if (!entry.pending) {
                        return [];
                    }

                    entry.abort?.abort();

                    return [track([`a workspace of run ${runId} still being created`], entry.pending.catch(() => undefined))];
                }));

            runs.clear();

            let timer: ClockTimer | undefined;
            const timedOut = await Promise.race([
                Promise.all([...started, ...creating, ...work]).then(() => false),
                new Promise<boolean>((resolve) => {
                    timer = clock.setTimeout(() => resolve(true), timeoutMs);
                    timer.unref?.();
                }),
            ]);

            timer?.clear();

            if (timedOut && left.size > 0) {
                onError(new SandboxError(`workspace manager close() gave up after ${timeoutMs} ms; still disposing: ${left.values().toArray().join(', ')}`));
            }
        },
    };

    return manager;
}
