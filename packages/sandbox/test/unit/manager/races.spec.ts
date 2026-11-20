/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { SandboxError } from '@chamvi/core';
import { createWorkspaceManager } from '@chamvi/sandbox';
import type {
    GarbageCollectOptions,
    GitCredential,
    IGitCredentials,
    WorkspaceManagerOptions,
} from '@chamvi/sandbox';
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
});
