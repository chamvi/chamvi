/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { SandboxError } from '@chamvi/core';
import type { IEngine, RunEvent } from '@chamvi/core';
import { RunStatus } from '@chamvi/core-kit';
import type { Run } from '@chamvi/core-kit';
import { createWorkspaceManager } from '@chamvi/sandbox';
import type {
    GarbageCollectOptions,
    GitCredential,
    IGitCredentials,
    WorkspaceManagerOptions,
} from '@chamvi/sandbox';
import { WorkspaceManagerContext } from '../../../src/manager/context/module.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { createFakeProvider } from '../../utils/provider.ts';
import type { FakeProvider } from '../../utils/provider.ts';

function setup(options: Partial<WorkspaceManagerOptions> = {}, provider?: FakeProvider) {
    const clock = new ControllableClock(new Date(1_000_000));
    const fake = provider ?? createFakeProvider({ clock });
    const errors: unknown[] = [];
    const manager = createWorkspaceManager({
        provider: fake,
        clock,
        gcIntervalMs: 0,
        onError: (error) => {
            errors.push(error);
        },
        ...options,
    });

    return {
        clock,
        provider: fake,
        errors,
        manager,
    };
}

/** Lets already-queued callbacks settle; not a sleep. */
const flush = () => new Promise<void>((resolve) => {
    setImmediate(resolve);
});

async function until(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 100 && !condition(); i++) {
        await flush();
    }

    expect(condition()).toBe(true);
}

/** Makes the provider's collection ask its isSuspendable for `runId`, then wait for `transition`. */
function suspendingCollection(provider: FakeProvider, runId: string, transition?: Promise<void>) {
    const answers: boolean[] = [];

    provider.collectGarbage = async (options?: GarbageCollectOptions) => {
        provider.gcOptions.push(options);
        answers.push(await options!.isSuspendable!(runId));
        await transition;

        return 0;
    };

    return answers;
}

/** Credentials whose write lookups wait for `write`: the acquire stays in its refresh until it resolves. */
function pendingWriteCredentials() {
    const write = Promise.withResolvers<GitCredential | undefined>();
    const state = { writes: 0 };
    const credentials: IGitCredentials = {
        async get(request) {
            if (request.access !== 'write') {
                return undefined;
            }

            state.writes++;

            return write.promise;
        },
    };

    return {
        write,
        state,
        credentials,
    };
}

/** An engine stand-in that records its run.updated listeners. */
function fakeEngine() {
    const listeners = new Set<(e: Extract<RunEvent, { type: 'run.updated' }>) => void>();

    return {
        on: ((type: string, listener: (e: Extract<RunEvent, { type: 'run.updated' }>) => void) => {
            if (type === 'run.updated') {
                listeners.add(listener);
            }

            return () => {
                listeners.delete(listener);
            };
        }) as IEngine['on'],
        emit(run: Pick<Run, 'id' | 'status'>) {
            for (const listener of listeners) {
                listener({ type: 'run.updated', run: run as Run });
            }
        },
    };
}

describe('workspace manager: races', () => {
    it('rejects an acquire whose workspace a release disposed during the credential refresh', async () => {
        const write = Promise.withResolvers<GitCredential | undefined>();
        let writes = 0;
        const credentials: IGitCredentials = {
            async get(request) {
                if (request.access !== 'write') {
                    return undefined;
                }

                writes++;

                return write.promise;
            },
        };
        const { manager, provider } = setup({ credentials });

        const acquired = manager.acquire('r1', { repo: 'octo/demo' });

        await until(() => writes === 1);

        const [id] = provider.workspaces.keys();
        const released = manager.release('r1');

        await flush();
        write.resolve(undefined);

        await expect(acquired).rejects.toThrow(SandboxError);
        await expect(acquired).rejects.toThrow(/released/);
        await released;
        expect(provider.disposed).toEqual([id]);
    });

    it('keeps the handles of a run that acquired another workspace while its suspension was decided', async () => {
        const answer = Promise.withResolvers<boolean>();
        const { manager, provider } = setup({ isSuspendable: () => answer.promise });

        await manager.acquire('r1', {});

        const collected = manager.collectGarbage();

        await flush();

        const { workspace } = await manager.acquire('r1', { repo: 'octo/demo' });
        const finds = provider.findCalls.length;

        answer.resolve(true);
        await collected;

        await expect(provider.gcOptions[0]!.isSuspendable!('r1')).resolves.toBe(false);
        await expect(manager.get('r1', workspace.id)).resolves.toBe(workspace);
        expect(provider.findCalls).toHaveLength(finds);
    });

    it('keeps the handle a get handed out while the suspension was decided', async () => {
        const answer = Promise.withResolvers<boolean>();
        const { manager, provider } = setup({ isSuspendable: () => answer.promise });
        const { workspace } = await manager.acquire('r1', {});

        const collected = manager.collectGarbage();

        await flush();
        await expect(manager.get('r1')).resolves.toBe(workspace);

        answer.resolve(true);
        await collected;

        await expect(provider.gcOptions[0]!.isSuspendable!('r1')).resolves.toBe(false);
        expect(provider.findCalls).toHaveLength(1);
    });

    it('never tells the provider to suspend a run a get adopted while its answer was pending', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const provider = createFakeProvider({ clock });
        const other = setup({}, provider);

        await other.manager.acquire('r1', {});

        const answer = Promise.withResolvers<boolean>();
        let asked = 0;
        const { manager } = setup({
            isSuspendable: () => {
                asked++;

                return answer.promise;
            },
        }, provider);
        const answers = suspendingCollection(provider, 'r1');
        const collected = manager.collectGarbage();

        await until(() => asked === 1);

        const workspace = await manager.get('r1');

        answer.resolve(true);
        await collected;

        expect(answers).toEqual([false]);
        expect(workspace.disposed).toBe(false);
    });

    it('holds a lookup until the provider finished suspending the run', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const provider = createFakeProvider({ clock });
        const other = setup({}, provider);

        await other.manager.acquire('r1', {});

        const transition = Promise.withResolvers<void>();
        const { manager } = setup({ isSuspendable: async () => true }, provider);
        const answers = suspendingCollection(provider, 'r1', transition.promise);
        const collected = manager.collectGarbage();

        await until(() => answers.length === 1);
        expect(answers).toEqual([true]);

        const finds = provider.findCalls.length;
        const got = manager.get('r1');

        for (let i = 0; i < 10; i++) {
            await flush();
        }

        expect(provider.findCalls).toHaveLength(finds);

        transition.resolve();
        await collected;
        await got;
        expect(provider.findCalls).toHaveLength(finds + 1);
    });

    it('retries a failed disposal by id, never handing the workspace out again', async () => {
        const { manager, provider } = setup();
        const { workspace } = await manager.acquire('r1', {});
        const scripted = provider.workspaces.get(workspace.id)!;
        const dispose = scripted.dispose.bind(scripted);
        let failures = 1;

        // like a pod deleted without its claim: the handle reads disposed, find skips it
        scripted.dispose = async () => {
            if (failures > 0) {
                failures--;
                scripted.disposed = true;

                throw new Error('claim delete failed');
            }

            await dispose();
        };

        await expect(manager.dispose('r1', workspace.id)).rejects.toThrow(/claim delete failed/);
        await expect(manager.get('r1', workspace.id)).rejects.toThrow(SandboxError);
        await expect(manager.dispose('r1', workspace.id)).resolves.toBe(workspace.id);
        await expect(manager.dispose('r1', workspace.id)).rejects.toThrow(/not found/);
    });

    it('holds a lookup until every overlapping collection finished suspending the run', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const provider = createFakeProvider({ clock });
        const other = setup({}, provider);

        await other.manager.acquire('r1', {});

        const transitions = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
        const answers: boolean[] = [];
        let calls = 0;
        const { manager } = setup({ isSuspendable: async () => true }, provider);

        provider.collectGarbage = async (options?: GarbageCollectOptions) => {
            const transition = transitions[calls++]!;

            answers.push(await options!.isSuspendable!('r1'));
            await transition.promise;

            return 0;
        };

        const first = manager.collectGarbage();
        const second = manager.collectGarbage();

        await until(() => answers.length === 2);
        expect(answers).toEqual([true, true]);

        // the later pass finishes first: the earlier one still stops the pod
        transitions[1]!.resolve();
        await second;

        const finds = provider.findCalls.length;
        const got = manager.get('r1');

        for (let i = 0; i < 10; i++) {
            await flush();
        }

        expect(provider.findCalls).toHaveLength(finds);

        transitions[0]!.resolve();
        await first;
        await got;
        expect(provider.findCalls).toHaveLength(finds + 1);
    });

    it('lets a lookup held by a suspension fail as closed once the manager closes', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const provider = createFakeProvider({ clock });
        const other = setup({}, provider);

        await other.manager.acquire('r1', {});

        const transition = Promise.withResolvers<void>();
        const { manager } = setup({ isSuspendable: async () => true }, provider);
        const answers = suspendingCollection(provider, 'r1', transition.promise);
        const collected = manager.collectGarbage();

        await until(() => answers.length === 1);

        const finds = provider.findCalls.length;
        let outcome: unknown;
        const got = manager.get('r1').then(() => 'resolved', (error: unknown) => error);

        got.then((value) => {
            outcome = value;
        });

        await flush();
        await manager.close();
        await until(() => outcome !== undefined);

        expect(outcome).toBeInstanceOf(SandboxError);
        expect((outcome as Error).message).toMatch(/closed/);
        expect(provider.findCalls).toHaveLength(finds);

        transition.resolve();
        await collected;
    });

    it('forgets a failed disposal once another handle of the workspace was disposed', async () => {
        const { manager, provider } = setup();
        const { workspace } = await manager.acquire('r1', {});
        const scripted = provider.workspaces.get(workspace.id)!;
        const dispose = scripted.dispose.bind(scripted);
        let failures = 1;

        scripted.dispose = async () => {
            if (failures > 0) {
                failures--;

                throw new Error('container remove failed');
            }

            await dispose();
        };

        await expect(manager.dispose('r1', workspace.id)).rejects.toThrow(/container remove failed/);

        // the container restarted: the lookup adopts a new handle of it
        provider.stop(workspace.id);
        await expect(manager.get('r1', workspace.id)).resolves.toMatchObject({ id: workspace.id });
        await expect(manager.dispose('r1', workspace.id)).resolves.toBe(workspace.id);
        await expect(manager.dispose('r1', workspace.id)).rejects.toThrow(/not found/);
    });

    it('drops the failed disposals of a released run even when they fail again', async () => {
        const {
            manager,
            provider,
            errors,
        } = setup({ isSettled: async () => true });
        const { workspace } = await manager.acquire('r1', {});
        const scripted = provider.workspaces.get(workspace.id)!;
        let attempts = 0;

        scripted.dispose = async () => {
            attempts++;

            throw new Error('container remove failed');
        };

        const engine = fakeEngine();

        manager.attach(engine);
        engine.emit({ id: 'r1', status: RunStatus.COMPLETED });
        await until(() => errors.length === 1);
        expect(attempts).toBe(1);

        // the provider's collection owns what a settled run left
        engine.emit({ id: 'r1', status: RunStatus.COMPLETED });

        for (let i = 0; i < 10; i++) {
            await flush();
        }

        expect(attempts).toBe(1);
        expect(errors).toHaveLength(1);
    });

    it('retries the failed disposal of the only workspace without an id, naming it in the failure', async () => {
        const { manager, provider } = setup();
        const { workspace } = await manager.acquire('r1', {});
        const scripted = provider.workspaces.get(workspace.id)!;
        const dispose = scripted.dispose.bind(scripted);
        let failures = 1;

        // like a pod deleted without its claim: the handle reads disposed, find skips it
        scripted.dispose = async () => {
            if (failures > 0) {
                failures--;
                scripted.disposed = true;

                throw new Error('claim delete failed');
            }

            await dispose();
        };

        await expect(manager.dispose('r1')).rejects.toThrow(workspace.id);
        await expect(manager.dispose('r1')).resolves.toBe(workspace.id);
        await expect(manager.dispose('r1')).rejects.toThrow(/no workspace/);
    });

    it('rejects an acquire as closed when the manager closed during the credential refresh, keeping the workspace', async () => {
        const {
            write,
            state,
            credentials,
        } = pendingWriteCredentials();
        const { manager, provider } = setup({ credentials });

        const acquired = manager.acquire('r1', { repo: 'octo/demo' });

        await until(() => state.writes === 1);

        let closed = false;
        const closing = manager.close().then(() => {
            closed = true;
        });

        await flush();
        // close joins the acquire still writing credentials
        expect(closed).toBe(false);
        write.resolve(undefined);
        await closing;

        await expect(acquired).rejects.toThrow(/the workspace manager is closed/);
        expect(provider.disposed).toEqual([]);
    });

    it('reports no credential failure of a workspace a release disposed during the refresh', async () => {
        const {
            write,
            state,
            credentials,
        } = pendingWriteCredentials();
        const { manager, errors } = setup({ credentials });

        const acquired = manager.acquire('r1', { repo: 'octo/demo' });

        await until(() => state.writes === 1);

        const released = manager.release('r1');

        await flush();
        // a credential to write: the refresh execs in the disposed workspace
        write.resolve({ username: 'x-access-token', password: 'write-token' });

        await expect(acquired).rejects.toThrow(/released/);
        await released;
        await flush();
        expect(errors).toEqual([]);
    });

    it('hands a second acquire of the key the workspace only once its credential refresh finished', async () => {
        const {
            write,
            state,
            credentials,
        } = pendingWriteCredentials();
        const { manager } = setup({ credentials });

        const first = manager.acquire('r1', { repo: 'octo/demo' });

        await until(() => state.writes === 1);

        let done = false;
        const second = manager.acquire('r1', { repo: 'octo/demo' }).finally(() => {
            done = true;
        });

        for (let i = 0; i < 10; i++) {
            await flush();
        }

        expect(done).toBe(false);

        write.resolve(undefined);

        const [a, b] = await Promise.all([first, second]);

        expect(b.reused).toBe(true);
        expect(b.workspace.id).toBe(a.workspace.id);
    });

    it('rejects an acquire whose workspace went gone during the credential refresh', async () => {
        const {
            write,
            state,
            credentials,
        } = pendingWriteCredentials();
        const { manager, provider } = setup({ credentials });

        const acquired = manager.acquire('r1', { repo: 'octo/demo' });

        await until(() => state.writes === 1);

        const [id] = provider.workspaces.keys();

        provider.stop(id!, { removed: true });
        write.resolve(undefined);

        await expect(acquired).rejects.toThrow(/is gone/);

        const again = await manager.acquire('r1', { repo: 'octo/demo' });

        expect(again.reused).toBe(false);
        expect(again.workspace.id).not.toBe(id);
    });

    it('never tells the provider to suspend a run a get touched while its answer was pending', async () => {
        const answer = Promise.withResolvers<boolean>();
        let asked = 0;
        const { manager, provider } = setup({
            isSuspendable: () => {
                asked++;

                return answer.promise;
            },
        });
        const answers = suspendingCollection(provider, 'r1');
        const collected = manager.collectGarbage();

        await until(() => asked === 1);

        // nothing to find: the run is neither held nor looked up afterwards
        await expect(manager.get('r1')).rejects.toThrow(SandboxError);

        answer.resolve(true);
        await collected;

        expect(answers).toEqual([false]);
    });

    it('keeps every target of concurrent failed disposals of one run', async () => {
        const provider = createFakeProvider();
        const ctx = new WorkspaceManagerContext({ provider });
        const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
        const targets = await Promise.all(gates.map(async (gate) => {
            const workspace = await provider.create({ runId: 'r1' } as never);

            workspace.dispose = async () => {
                await gate.promise;

                throw new Error('container remove failed');
            };

            return workspace;
        }));

        // both capture the run's retry map before either fails
        const disposals = targets.map((workspace) => ctx.disposeTarget('r1', workspace).catch(() => undefined));

        gates[0]!.resolve();
        await flush();
        gates[1]!.resolve();
        await Promise.all(disposals);

        expect(Array.from(ctx.failedDisposals.get('r1')?.keys() ?? []).toSorted()).toEqual(targets.map((w) => w.id).toSorted());
    });

    it('stamps no activity without isSuspendable', () => {
        const ctx = new WorkspaceManagerContext({ provider: createFakeProvider() });

        ctx.touch('r1');

        expect(ctx.activity.size).toBe(0);
    });
});
