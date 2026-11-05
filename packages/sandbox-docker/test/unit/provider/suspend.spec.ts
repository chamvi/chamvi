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
import { SandboxError, systemClock } from '@chamvi/core';
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
    function setup(clock?: ControllableClock) {
        return {
            provider: createDockerSandbox({
                ...dockerOptions,
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
});
