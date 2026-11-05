/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { createWorkspaceManager } from '@chamvi/sandbox';
import type { WorkspaceManagerOptions } from '@chamvi/sandbox';
import { ControllableClock } from '../../utils/clock.ts';
import { createFakeProvider } from '../../utils/provider.ts';

function setup(options: Partial<WorkspaceManagerOptions> = {}) {
    const clock = new ControllableClock(new Date(1_000_000));
    const provider = createFakeProvider({ clock });
    const errors: unknown[] = [];
    const manager = createWorkspaceManager({
        provider,
        clock,
        gcIntervalMs: 0,
        onError: (error) => {
            errors.push(error);
        },
        ...options,
    });

    return {
        clock,
        provider,
        errors,
        manager,
    };
}

describe('workspace manager: suspension', () => {
    it('collectGarbage passes the provider an isSuspendable asking the option for runs it holds nothing of', async () => {
        const isSettled = async () => false;
        const asked: string[] = [];
        const { manager, provider } = setup({
            isSettled,
            isSuspendable: async (runId) => {
                asked.push(runId);

                return true;
            },
        });

        await manager.collectGarbage();

        const [options] = provider.gcOptions;

        expect(options).toEqual({
            deployment: 'default',
            isSettled,
            isSuspendable: expect.any(Function),
        });
        await expect(options!.isSuspendable!('other')).resolves.toBe(true);
        expect(asked).toEqual(['other']);
    });

    it('hands the provider its own answer for a run it found suspendable, asked once', async () => {
        const asked: string[] = [];
        const { manager, provider } = setup({
            isSuspendable: async (runId) => {
                asked.push(runId);

                return true;
            },
        });

        await manager.acquire('r1', {});
        await manager.collectGarbage();

        await expect(provider.gcOptions[0]!.isSuspendable!('r1')).resolves.toBe(true);
        expect(asked).toEqual(['r1']);
    });

    it('never tells the provider to suspend a held run whose answer was rejected', async () => {
        let calls = 0;
        const {
            manager, 
            provider, 
            errors, 
        } = setup({
            isSuspendable: async () => {
                calls++;

                if (calls === 1) {
                    throw new Error('store down');
                }

                return true;
            },
        });
        const { workspace } = await manager.acquire('r1', {});

        await manager.collectGarbage();

        await expect(provider.gcOptions[0]!.isSuspendable!('r1')).resolves.toBe(false);
        expect(calls).toBe(1);
        expect(errors).toHaveLength(1);
        await expect(manager.get('r1')).resolves.toBe(workspace);
    });

    it('never tells the provider to suspend a held run it found not suspendable', async () => {
        let calls = 0;
        const { manager, provider } = setup({
            // the threshold passes between two calls
            isSuspendable: async () => {
                calls++;

                return calls > 1;
            },
        });
        const { workspace } = await manager.acquire('r1', {});

        await manager.collectGarbage();

        await expect(provider.gcOptions[0]!.isSuspendable!('r1')).resolves.toBe(false);
        expect(calls).toBe(1);
        await expect(manager.get('r1')).resolves.toBe(workspace);
    });

    it('never tells the provider to suspend a held workspace next to a pending create of its run', async () => {
        const { manager, provider } = setup({ isSuspendable: async () => true });
        const { workspace } = await manager.acquire('r1', {});
        const { promise, resolve: open } = Promise.withResolvers<void>();

        provider.gate = promise;

        const acquiring = manager.acquire('r1', { repo: 'octo/demo' });

        while (provider.created.length === 1) {
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
        }

        await manager.collectGarbage();

        await expect(provider.gcOptions[0]!.isSuspendable!('r1')).resolves.toBe(false);

        open();
        await acquiring;

        await expect(manager.get('r1', workspace.id)).resolves.toBe(workspace);
    });

    it('passes no isSuspendable without the option', async () => {
        const { manager, provider } = setup();

        await manager.collectGarbage();

        expect(provider.gcOptions).toEqual([{ deployment: 'default' }]);
    });

    it('forgets held workspaces of a suspendable run without disposing', async () => {
        const asked: string[] = [];
        const { manager, provider } = setup({
            isSuspendable: async (runId) => {
                asked.push(runId);

                return runId === 'r1';
            },
        });
        const { workspace } = await manager.acquire('r1', {});
        const { workspace: other } = await manager.acquire('r2', {});

        // the provider suspends it: its next find answers a fresh handle
        await manager.collectGarbage();
        provider.stop(workspace.id);

        expect(asked.sort()).toEqual(['r1', 'r2']);
        expect(provider.disposed).toEqual([]);

        const findsBefore = provider.findCalls.length;
        const found = await manager.get('r1');

        expect(found.id).toBe(workspace.id);
        expect(found).not.toBe(workspace);
        expect(provider.findCalls.length).toBe(findsBefore + 1);
        expect(provider.findCalls.at(-1)!.runId).toBe('r1');

        await expect(manager.get('r2')).resolves.toBe(other);
        expect(provider.findCalls.length).toBe(findsBefore + 1);
    });

    it('keeps held workspaces of a run that is not suspendable', async () => {
        const { manager, provider } = setup({ isSuspendable: async () => false });
        const { workspace } = await manager.acquire('r1', {});

        await manager.collectGarbage();

        const findsBefore = provider.findCalls.length;

        await expect(manager.get('r1')).resolves.toBe(workspace);
        expect(provider.findCalls.length).toBe(findsBefore);
    });

    it('never asks for a run whose create is still pending', async () => {
        const asked: string[] = [];
        const { manager, provider } = setup({
            isSuspendable: async (runId) => {
                asked.push(runId);

                return true;
            },
        });
        const { promise, resolve: open } = Promise.withResolvers<void>();

        provider.gate = promise;

        const acquiring = manager.acquire('r1', {});

        // the create is in flight (recorded, held at the gate)
        while (provider.created.length === 0) {
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
        }

        await manager.collectGarbage();
        expect(asked).toEqual([]);

        open();

        const { workspace } = await acquiring;

        await expect(manager.get('r1')).resolves.toBe(workspace);
    });

    it('isSuspendable rejection is reported and keeps the workspace', async () => {
        const failure = new Error('store down');
        const {
            manager, 
            provider, 
            errors, 
        } = setup({
            isSuspendable: async () => {
                throw failure;
            },
        });
        const { workspace } = await manager.acquire('r1', {});

        await manager.collectGarbage();

        expect(errors).toEqual([failure]);

        const findsBefore = provider.findCalls.length;

        await expect(manager.get('r1')).resolves.toBe(workspace);
        expect(provider.findCalls.length).toBe(findsBefore);
        expect(provider.disposed).toEqual([]);
    });

    it('a settled run is released, not suspended', async () => {
        const asked: string[] = [];
        const { manager, provider } = setup({
            isSettled: async () => true,
            isSuspendable: async (runId) => {
                asked.push(runId);

                return true;
            },
        });
        const { workspace } = await manager.acquire('r1', {});

        await manager.collectGarbage();

        expect(provider.disposed).toEqual([workspace.id]);
        expect(asked).toEqual([]);
    });

    it('find gets rebuild env and limits', async () => {
        const author = { name: 'demo[bot]', email: 'demo@example.com' };
        const { manager, provider } = setup({
            env: { A: '1' }, 
            author, 
            limits: { cpu: '2' }, 
        });

        await manager.get('r1').catch(() => undefined);

        expect(provider.findCalls).toEqual([{
            runId: 'r1',
            options: {
                deployment: 'default',
                rebuild: {
                    env: {
                        A: '1',
                        GIT_AUTHOR_NAME: author.name,
                        GIT_AUTHOR_EMAIL: author.email,
                        GIT_COMMITTER_NAME: author.name,
                        GIT_COMMITTER_EMAIL: author.email,
                    },
                    limits: { cpu: '2' },
                },
            },
        }]);
    });

    it('find gets the same env and limits create gets', async () => {
        const { manager, provider } = setup({ env: { A: '1' }, limits: { cpu: '2' } });

        await manager.acquire('r1', {});

        const [lookup] = provider.findCalls;

        expect(lookup!.options!.rebuild).toEqual({ env: provider.created[0]!.env, limits: provider.created[0]!.limits });
    });

    it('find gets no rebuild key without env, author or limits', async () => {
        const { manager, provider } = setup();

        await manager.get('r1').catch(() => undefined);

        expect(provider.findCalls).toEqual([{ runId: 'r1', options: { deployment: 'default' } }]);
    });

    it('release looks up the run with restore false, so a suspended workspace is not rebuilt to be removed', async () => {
        const { manager, provider } = setup({ limits: { cpu: '2' } });

        await manager.release('r1');

        expect(provider.findCalls).toEqual([{
            runId: 'r1',
            options: { deployment: 'default', restore: false },
        }]);
    });

    it('a lookup for use keeps restoring', async () => {
        const { manager, provider } = setup();

        await manager.get('r1').catch(() => undefined);
        await manager.acquire('r1', {});

        expect(provider.findCalls).not.toHaveLength(0);
        expect(provider.findCalls.every(({ options }) => options!.restore === undefined)).toBe(true);
    });

    it('rejects an isSuspendable that is no function', () => {
        expect(() => setup({ isSuspendable: 'yes' as unknown as WorkspaceManagerOptions['isSuspendable'] }))
            .toThrow(InvalidAgentDefinitionError);
    });
});
