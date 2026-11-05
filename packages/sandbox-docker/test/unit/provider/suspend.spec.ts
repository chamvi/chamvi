/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import Docker from 'dockerode';
import {
    afterAll,
    expect,
    it,
} from 'vitest';
import { SandboxError, ValidationError, systemClock } from '@chamvi/core';
import { createWorkspaceManager } from '@chamvi/sandbox';
import type { IWorkspace } from '@chamvi/sandbox';
import { CONTAINER_NAME_PREFIX, createDockerSandbox } from '@chamvi/sandbox-docker';
import { ControllableClock } from '@chamvi/test-kit';
import { describeDocker, dockerOptions } from '../../utils/docker.ts';

/**
 * Controllable `now` (the expiry), real timers: the transport polls the
 * exec state on `clock.setTimeout`, which a manual clock would never fire.
 */
class ExpiryClock extends ControllableClock {
    override setTimeout(fn: () => void, ms: number): { clear(): void } {
        return systemClock.setTimeout(fn, ms);
    }
}

function statusCode(error: unknown): number | undefined {
    return (error as { statusCode?: number } | undefined)?.statusCode;
}

describeDocker('docker suspension', () => {
    const docker = new Docker();
    const workspaces: IWorkspace[] = [];

    afterAll(async () => {
        await Promise.all(workspaces.map((workspace) => workspace.dispose().catch(() => undefined)));
    });

    function containerOf(workspace: IWorkspace): Docker.Container {
        return docker.getContainer(`${CONTAINER_NAME_PREFIX}${workspace.id}`);
    }

    /** A provider and a deployment of its own, so no workspace of a spec running alongside is in the pass. */
    function setup(clock?: ControllableClock, suspend = true) {
        return {
            provider: createDockerSandbox({
                ...dockerOptions,
                suspend,
                ...(clock ? { clock, limits: { maxLifetimeMs: 600_000 } } : {}),
            }),
            deployment: `test-${randomUUID().slice(0, 8)}`,
            runId: `test-${randomUUID()}`,
        };
    }

    it('stops a running container of a suspendable run and keeps it, uncounted', async () => {
        const {
            provider, 
            deployment, 
            runId, 
        } = setup();
        const workspace = await provider.create({ runId, deployment });

        workspaces.push(workspace);
        await workspace.writeFile('a.txt', 'kept');

        expect(await provider.collectGarbage({ deployment, isSuspendable: async () => true })).toBe(0);

        const { State: state } = await containerOf(workspace).inspect();

        expect(state.Status).toBe('exited');
    });

    it('stops nothing without the suspend option', async () => {
        const {
            provider,
            deployment,
            runId,
        } = setup(undefined, false);
        const workspace = await provider.create({ runId, deployment });

        workspaces.push(workspace);

        expect(await provider.collectGarbage({ deployment, isSuspendable: async () => true })).toBe(0);
        expect((await containerOf(workspace).inspect()).State.Running).toBe(true);
        expect((await workspace.exec(['true'])).exitCode).toBe(0);
    });

    it('find without restore hands out a suspended workspace stopped, and its dispose removes it', async () => {
        const {
            provider,
            deployment,
            runId,
        } = setup();
        const workspace = await provider.create({ runId, deployment });

        workspaces.push(workspace);
        await provider.collectGarbage({ deployment, isSuspendable: async () => true });

        const found = await provider.find(runId, { deployment, restore: false });

        expect(found.map((item) => item.id)).toEqual([workspace.id]);
        expect((await containerOf(workspace).inspect()).State.Status).toBe('exited');

        await found[0]!.dispose();
        await expect(containerOf(workspace).inspect()).rejects.toSatisfy((error) => statusCode(error) === 404);
    });

    it('find restarts a suspended workspace with its files through a fresh handle', async () => {
        const {
            provider, 
            deployment, 
            runId, 
        } = setup();
        const workspace = await provider.create({ runId, deployment });

        workspaces.push(workspace);
        await workspace.writeFile('a.txt', 'kept');
        await provider.collectGarbage({ deployment, isSuspendable: async () => true });

        const found = await provider.find(runId, { deployment });

        workspaces.push(...found);
        expect(found.map((item) => item.id)).toEqual([workspace.id]);
        // the provider dropped the held handle when it suspended: never handed out stale
        expect(found[0]).not.toBe(workspace);
        expect((await containerOf(workspace).inspect()).State.Running).toBe(true);
        expect(await found[0]!.readFile('a.txt')).toBe('kept');
        expect((await found[0]!.exec(['true'])).exitCode).toBe(0);
        expect(await provider.find(runId, { deployment })).toEqual(found);
    });

    it('a find during a suspension waits for its stop, then restarts the container behind a working handle', async () => {
        const { promise: gate, resolve: release } = Promise.withResolvers<void>();
        let stopping = false;
        // the real daemon, with every container stop held until release()
        const gated = Object.create(docker) as Docker;

        gated.getContainer = (id: string) => {
            const container = docker.getContainer(id);
            const stop = container.stop.bind(container);

            container.stop = (async (...args: unknown[]) => {
                stopping = true;
                await gate;

                return (stop as (...rest: unknown[]) => Promise<unknown>)(...args);
            }) as Docker.Container['stop'];

            return container;
        };

        const provider = createDockerSandbox({
            ...dockerOptions, 
            docker: gated, 
            suspend: true, 
        });
        const deployment = `test-${randomUUID().slice(0, 8)}`;
        const runId = `test-${randomUUID()}`;
        const workspace = await provider.create({ runId, deployment });

        workspaces.push(workspace);
        await workspace.writeFile('a.txt', 'kept');

        const collecting = provider.collectGarbage({ deployment, isSuspendable: async () => true });

        while (!stopping) {
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
        }

        const finding = provider.find(runId, { deployment });

        // the find lists the container while it still runs
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 200);
        });
        release();
        await collecting;

        const found = await finding;

        workspaces.push(...found);
        expect(found.map((item) => item.id)).toEqual([workspace.id]);
        expect((await containerOf(workspace).inspect()).State.Running).toBe(true);
        expect(await found[0]!.readFile('a.txt')).toBe('kept');
        expect((await found[0]!.exec(['true'])).exitCode).toBe(0);
    });

    it('a manager gets the workspace of a suspended run back with its files', async () => {
        const {
            provider, 
            deployment, 
            runId, 
        } = setup();
        const errors: unknown[] = [];
        let suspendable = true;
        const manager = createWorkspaceManager({
            provider,
            deployment,
            gcIntervalMs: 0,
            isSuspendable: async () => suspendable,
            onError: (error) => {
                errors.push(error);
            },
        });
        const { workspace } = await manager.acquire(runId, {});

        workspaces.push(workspace);
        await workspace.writeFile('a.txt', 'kept');

        expect(await manager.collectGarbage()).toBe(0);
        expect((await containerOf(workspace).inspect()).State.Status).toBe('exited');

        // the run was answered: back to running, its workspace comes back
        suspendable = false;

        const resumed = await manager.get(runId);

        workspaces.push(resumed);
        expect(resumed.id).toBe(workspace.id);
        expect(await resumed.readFile('a.txt')).toBe('kept');
        expect(errors).toEqual([]);
    });

    it('removes a suspended container whose run settled', async () => {
        const {
            provider, 
            deployment, 
            runId, 
        } = setup();
        const workspace = await provider.create({ runId, deployment });

        workspaces.push(workspace);
        await provider.collectGarbage({ deployment, isSuspendable: async () => true });

        expect(await provider.collectGarbage({ deployment, isSettled: async () => true })).toBe(1);
        await expect(containerOf(workspace).inspect()).rejects.toSatisfy((error) => statusCode(error) === 404);
    });

    it('removes a settled run\'s container rather than suspending it', async () => {
        const {
            provider, 
            deployment, 
            runId, 
        } = setup();
        const workspace = await provider.create({ runId, deployment });

        workspaces.push(workspace);

        expect(await provider.collectGarbage({
            deployment,
            isSettled: async () => true,
            isSuspendable: async () => true,
        })).toBe(1);
        await expect(containerOf(workspace).inspect()).rejects.toSatisfy((error) => statusCode(error) === 404);
    });

    it('keeps a workspace running when isSuspendable rejects and rejects the pass once', async () => {
        const { provider, deployment } = setup();
        const failing = `test-${randomUUID()}`;
        const other = `test-${randomUUID()}`;
        const kept = await provider.create({ runId: failing, deployment });
        const stopped = await provider.create({ runId: other, deployment });

        workspaces.push(kept, stopped);

        const error = await provider.collectGarbage({
            deployment,
            isSuspendable: async (runId) => {
                if (runId === failing) {
                    throw new Error('store down');
                }

                return true;
            },
        }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(SandboxError);
        expect((error as Error).message).toMatch(/1 failed.*store down/);
        expect((await containerOf(kept).inspect()).State.Running).toBe(true);
        expect((await containerOf(stopped).inspect()).State.Status).toBe('exited');
    });

    it('removes an expired workspace instead of suspending it', async () => {
        // the real time, since a container sleeps until its expiry on the daemon's clock
        const clock = new ExpiryClock(new Date());
        const {
            provider, 
            deployment, 
            runId, 
        } = setup(clock);
        const workspace = await provider.create({ runId, deployment });

        workspaces.push(workspace);
        clock.advance(600_000);

        expect(await provider.collectGarbage({ deployment, isSuspendable: async () => true })).toBe(1);
        await expect(containerOf(workspace).inspect()).rejects.toSatisfy((error) => statusCode(error) === 404);
    });

    /**
     * Two bare repositories (one commit each) in the shared cache volume,
     * so a workspace clones them over file:// without the network.
     */
    async function createCacheRepos(): Promise<[string, string]> {
        const {
            provider, 
            deployment, 
            runId, 
        } = setup();
        const helper = await provider.create({ runId, deployment });
        const root = `/cache/repos-${randomUUID().slice(0, 8)}`;

        try {
            const result = await helper.exec(['sh', '-c', [
                'set -e',
                'for name in a b; do',
                `  git init -q -b main "${root}/src-$name"`,
                `  echo "$name" > "${root}/src-$name/$name.txt"`,
                `  git -C "${root}/src-$name" add .`,
                `  git -C "${root}/src-$name" -c user.name=t -c user.email=t@t commit -q -m init`,
                `  git clone -q --bare "${root}/src-$name" "${root}/$name.git"`,
                'done',
            ].join('\n')]);

            expect(result.exitCode, result.stderr).toBe(0);
        } finally {
            await helper.dispose();
        }

        return [`file://${root}/a.git`, `file://${root}/b.git`];
    }

    it.each([
        ['the release of one by id', async (manager: ReturnType<typeof createWorkspaceManager>, runId: string, id: string) => {
            await manager.release(runId, id);
        }],
        ['an id-less dispose that refuses several', async (manager: ReturnType<typeof createWorkspaceManager>, runId: string) => {
            await expect(manager.dispose(runId)).rejects.toBeInstanceOf(ValidationError);
        }],
    ])('after a restart, %s keeps the other repository workspace reusable with its files', async (_name, remove) => {
        const [repoA, repoB] = await createCacheRepos();
        const {
            provider, 
            deployment, 
            runId, 
        } = setup();
        const manage = (sandbox: typeof provider) => createWorkspaceManager({
            provider: sandbox,
            deployment,
            gcIntervalMs: 0,
            allowFileRepos: true,
        });
        const first = manage(provider);
        const { workspace: a } = await first.acquire(runId, { repo: repoA });
        const { workspace: b } = await first.acquire(runId, { repo: repoB });

        workspaces.push(a, b);
        await b.writeFile('work.txt', 'kept');

        // a restart: a fresh provider and manager hold nothing
        const restarted = manage(createDockerSandbox({ ...dockerOptions, suspend: true }));

        await remove(restarted, runId, a.id);

        const again = await restarted.acquire(runId, { repo: repoB });

        workspaces.push(again.workspace);
        expect(again.workspace.id).toBe(b.id);
        expect(again.reused).toBe(true);
        expect(await again.workspace.readFile('work.txt')).toBe('kept');
        expect(await again.workspace.readFile('b.txt')).toBe('b\n');
        expect(await restarted.get(runId, b.id)).toBe(again.workspace);
    });
});
