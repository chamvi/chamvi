/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { V1Pod } from '@kubernetes/client-node';
import { describe, expect, it } from 'vitest';
import { SandboxError } from '@chamvi/core';
import { createWorkspaceManager } from '@chamvi/sandbox';
import { POLL_MS, START_TIMEOUT_MS, createKubernetesSandbox } from '@chamvi/sandbox-k8s';
import type { KubernetesSandboxOptions } from '@chamvi/sandbox-k8s';
import { ControllableClock } from '@chamvi/test-kit';
import { createFakePodClient, unwrap } from '../../utils/client.ts';
import type { FakeExecHandler, FakePodClient } from '../../utils/client.ts';
import { drive, flush } from '../../utils/drive.ts';

const START = 1_000_000;
const COMMIT = 'a'.repeat(40);
const REPO = 'https://github.com/octo/demo.git';
const DAY_MS = 86_400_000;
/** At least the wait between two checkout reads. */
const CHECKOUT_READ_RETRY_MS = 1000;

/** The remote's default branch (main) and HEAD for the checkout. */
const answerCommit: FakeExecHandler = (argv) => {
    const command = unwrap(argv);

    if (command.includes('ls-remote')) {
        return { stdout: `ref: refs/heads/main\tHEAD\n${COMMIT}\tHEAD\n` };
    }

    if (command[1] !== 'rev-parse') {
        return {};
    }

    return command[2] === '-q' ? { exitCode: 1 } : { stdout: `${COMMIT}\n` };
};

function provide(client: FakePodClient, clock: ControllableClock, options: Partial<KubernetesSandboxOptions> = {}) {
    return createKubernetesSandbox({
        namespace: 'agents',
        image: 'img',
        client,
        clock,
        persistence: {},
        ...options,
    });
}

function setup(options: Partial<KubernetesSandboxOptions> = {}) {
    const clock = new ControllableClock(new Date(START));
    const client = createFakePodClient(answerCommit);

    return {
        clock,
        client,
        provider: provide(client, clock, options),
    };
}

const waiting = { isSettled: async () => false, isSuspendable: async () => true };

/** Makes every checkout read (`git config --get-regexp`) throw while `when()` holds. */
function failCheckoutReads(client: FakePodClient, when: (name: string) => boolean = () => true) {
    const { exec } = client;

    client.exec = async (name, input) => {
        const command = unwrap(input.argv);

        if (command[1] === 'config' && command[2] === '--get-regexp' && when(name)) {
            client.execs.push({ name, argv: [...input.argv] });

            throw new Error('exec failed: container not found');
        }

        return exec(name, input);
    };
}

/** Holds every pod delete until `release()`; `called` once one was asked for. */
function gateDeletes(client: FakePodClient) {
    const { delete: remove } = client;
    const { promise: gate, resolve } = Promise.withResolvers<void>();
    const state = { called: false, release: () => resolve() };

    client.delete = async (name) => {
        state.called = true;
        await gate;

        return remove(name);
    };

    return state;
}

function envOf(pod: V1Pod): Record<string, string> {
    return Object.fromEntries(pod.spec!.containers[0]!.env!.map(({ name, value }) => [name, value!]));
}

describe('kubernetes suspension', () => {
    it('suspends a running pod of a suspendable run that has a claim', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;

        await expect(provider.collectGarbage(waiting)).resolves.toBe(0);
        expect(client.deleted).toEqual([name]);
        expect(client.pods.has(name)).toBe(false);
        expect(client.claims.has(name)).toBe(true);
        expect(client.deletedClaims).toEqual([]);

        // the held handle was dropped, not disposed: the next find rebuilds behind a fresh one
        const [found] = await provider.find('r1');

        expect(found).not.toBe(workspace);
        expect(found!.id).toBe(workspace.id);
        expect(client.created).toHaveLength(2);
        expect(client.deletedClaims).toEqual([]);
    });

    it('keeps the pod of a run that is not suspendable', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });

        await provider.collectGarbage({ isSettled: async () => false, isSuspendable: async () => false });
        await provider.collectGarbage({ isSettled: async () => false });
        expect(client.deleted).toEqual([]);
        await expect(provider.find('r1')).resolves.toEqual([workspace]);
    });

    it('removes rather than suspends a settled run', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });

        await expect(provider.collectGarbage({ isSettled: async () => true, isSuspendable: async () => true })).resolves.toBe(1);
        expect(workspace.disposed).toBe(true);
        expect(client.claims.size).toBe(0);
    });

    it('keeps the pod running and reports a rejected isSuspendable', async () => {
        const { client, provider } = setup();

        await provider.create({ runId: 'r1' });

        const error = await provider.collectGarbage({
            isSettled: async () => false,
            isSuspendable: async () => {
                throw new Error('store down');
            },
        }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(SandboxError);
        expect((error as Error).message).toContain('store down');
        expect(client.deleted).toEqual([]);
    });

    it('find rebuilds the pod of a claim without a running pod', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup({ env: { A: '1' }, limits: { cpu: '2' } });
        const created = await provider.create({
            runId: 'r1',
            repo: REPO,
            image: 'custom',
        });
        const name = `chamvi-ws-${created.id}`;

        // suspended by another replica
        client.pods.delete(name);
        clock.advance(10_500);

        const replica = provide(client, clock, { env: { A: '1', C: '3' }, limits: { cpu: '2' } });
        const found = await replica.find('r1', { rebuild: { env: { B: '2' }, limits: { memory: '4Gi' } } });
        const pod = client.created.at(-1)!;

        expect(found.map((workspace) => workspace.id)).toEqual([created.id]);
        expect(found[0]!.info).toEqual(created.info);
        expect(found[0]!.info).toMatchObject({ commit: COMMIT, defaultBranch: 'main' });
        expect(pod.metadata!.name).toBe(name);
        expect(pod.metadata!.labels).toEqual(client.claims.get(name)!.metadata!.labels);
        expect(pod.metadata!.annotations).toEqual(client.claims.get(name)!.metadata!.annotations);
        expect(pod.spec!.containers[0]!.image).toBe('custom');
        expect(envOf(pod)).toMatchObject({
            A: '1', 
            B: '2', 
            C: '3', 
        });
        expect(pod.spec!.containers[0]!.resources!.limits).toMatchObject({ cpu: '2', memory: '4Gi' });
        expect(pod.spec!.activeDeadlineSeconds).toBe(Math.ceil((7 * DAY_MS - 10_500) / 1000));
        expect(pod.spec!.volumes).toContainEqual({ name: 'workspace', persistentVolumeClaim: { claimName: name } });
        await expect(found[0]!.exec(['true'])).resolves.toMatchObject({ exitCode: 0 });
    });

    it('gives a rebuilt pod at least one second', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup({ limits: { maxLifetimeMs: 60_000 } });
        const workspace = await provider.create({ runId: 'r1' });

        client.pods.delete(`chamvi-ws-${workspace.id}`);
        clock.advance(59_999);

        await provider.find('r1');
        expect(client.created.at(-1)!.spec!.activeDeadlineSeconds).toBe(1);
    });

    it('a gone held handle falls through to the rebuild', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });

        client.pods.delete(`chamvi-ws-${workspace.id}`);

        const [found] = await provider.find('r1');

        expect(found).not.toBe(workspace);
        expect(found!.id).toBe(workspace.id);
        expect(client.created).toHaveLength(2);
    });

    it('rebuilds a claim whose pod failed after deleting that pod', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;

        client.pods.get(name)!.status = { phase: 'Failed', reason: 'Evicted' };

        const replica = provide(client, new ControllableClock(new Date(START)));
        const [found] = await replica.find('r1');

        expect(client.deleted).toEqual([name]);
        expect(found!.id).toBe(workspace.id);
        expect(client.created).toHaveLength(2);
        expect(client.claims.has(name)).toBe(true);
    });

    it('a rebuilt claim without its checkout record deletes its pod and keeps the claim', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;

        // an orphan claim: the create died before its checkout record
        client.pods.delete(name);
        client.gitConfig.delete(name);

        const replica = provide(client, new ControllableClock(new Date(START)));

        await expect(replica.find('r1')).resolves.toEqual([]);
        expect(client.created).toHaveLength(2);
        expect(client.pods.has(name)).toBe(false);
        expect(client.claims.has(name)).toBe(true);
        expect(client.deletedClaims).toEqual([]);
    });

    it('a rebuild that cannot start throws SandboxError and leaves the claim', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;

        client.pods.delete(name);
        client.statuses = [{
            phase: 'Pending',
            containerStatuses: [{
                name: 'sandbox',
                image: 'img',
                imageID: '',
                ready: false,
                restartCount: 0,
                state: { waiting: { reason: 'ErrImagePull', message: 'pull access denied' } },
            }],
        }];

        const error = await provider.find('r1').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(SandboxError);
        expect((error as Error).message).toContain('ErrImagePull');
        expect(client.claims.has(name)).toBe(true);
        expect(client.deletedClaims).toEqual([]);
        expect(client.pods.has(name)).toBe(false);
    });

    it('a rebuild that does not start in time throws SandboxError and leaves the claim', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;

        client.pods.delete(name);
        client.statuses = [{ phase: 'Pending' }];

        const finding = provider.find('r1');

        await expect(drive(finding, clock, POLL_MS, START_TIMEOUT_MS / POLL_MS + 10)).rejects.toThrow(/did not start/);
        await expect(finding).rejects.toBeInstanceOf(SandboxError);
        expect(client.claims.has(name)).toBe(true);
        expect(client.deletedClaims).toEqual([]);
    });

    it('concurrent finds create one pod', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;
        const { create } = client;
        let attempts = 0;

        client.pods.delete(name);
        client.create = async (pod) => {
            attempts++;

            return create(pod);
        };

        const first = provide(client, clock);
        const second = provide(client, clock);
        const [a, b] = await Promise.all([first.find('r1'), second.find('r1')]);

        expect(attempts).toBe(2);
        expect(client.created).toHaveLength(2);
        expect(a!.map((item) => item.id)).toEqual([workspace.id]);
        expect(b!.map((item) => item.id)).toEqual([workspace.id]);
    });

    it('an expired claim is never rebuilt', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup({ limits: { maxLifetimeMs: 60_000 } });
        const workspace = await provider.create({ runId: 'r1' });

        client.pods.delete(`chamvi-ws-${workspace.id}`);
        clock.advance(60_000);

        await expect(provider.find('r1')).resolves.toEqual([]);
        expect(client.created).toHaveLength(1);
    });

    it('a deleting pod is rebuilt once it is gone', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;
        const { create } = client;
        let attempts = 0;

        client.pods.get(name)!.metadata!.deletionTimestamp = new Date(START);
        client.create = async (pod) => {
            attempts++;

            // the delete completes after the first conflict
            if (attempts === 2) {
                client.pods.delete(name);
            }

            return create(pod);
        };

        const replica = provide(client, clock);
        const found = await drive(replica.find('r1'), clock, POLL_MS);

        expect(attempts).toBe(2);
        expect(found.map((item) => item.id)).toEqual([workspace.id]);
        expect(client.pods.get(name)!.metadata!.deletionTimestamp).toBeUndefined();
    });

    it('gives up on a pod still being deleted after the start timeout', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;

        client.pods.get(name)!.metadata!.deletionTimestamp = new Date(START);

        const replica = provide(client, clock);
        const finding = replica.find('r1');

        await flush();
        await expect(drive(finding, clock, POLL_MS, START_TIMEOUT_MS / POLL_MS + 10)).rejects.toBeInstanceOf(SandboxError);
        expect(client.claims.has(name)).toBe(true);
    });

    it('never rebuilds the pod of a create still in progress', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();

        client.statuses = [{ phase: 'Pending' }, { phase: 'Pending' }, { phase: 'Running' }];

        const creating = provider.create({ runId: 'r1' });

        await flush();
        await flush();

        expect(client.claims.size).toBe(1);
        await provider.find('r1');

        await expect(drive(creating, clock, POLL_MS)).resolves.toBeDefined();
        expect(client.created).toHaveLength(1);
    });
    it('never rebuilds a claim being deleted', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;

        // a pod deleted with grace 0 lingers a moment, and pvc-protection keeps its claim Terminating
        client.protectClaims = true;
        client.delete = async (pod) => {
            client.deleted.push(pod);
            client.pods.get(pod)!.metadata!.deletionTimestamp = new Date();
        };

        await workspace.dispose();
        expect(client.claims.get(name)?.metadata?.deletionTimestamp).toBeDefined();

        await expect(provider.find('r1')).resolves.toEqual([]);
        expect(client.created).toHaveLength(1);
    });

    it('a find with restore false answers a suspended claim without a rebuild, and its dispose removes it', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1', repo: REPO });
        const name = `chamvi-ws-${workspace.id}`;

        await provider.collectGarbage(waiting);
        expect(client.pods.has(name)).toBe(false);

        const execs = client.execs.length;
        const found = await provider.find('r1', { restore: false });

        expect(found.map(({ id, info }) => ({ id, runId: info.runId }))).toEqual([{ id: workspace.id, runId: 'r1' }]);
        expect(client.created).toHaveLength(1);
        expect(client.execs).toHaveLength(execs);

        await found[0]!.dispose();
        expect(client.created).toHaveLength(1);
        expect(client.claims.has(name)).toBe(false);
        expect(client.deletedClaims).toEqual([name]);
    });

    it('a find with restore false still answers a running pod', async () => {
        const { provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });

        await expect(provider.find('r1', { restore: false })).resolves.toEqual([workspace]);
    });
    it('the manager releases a suspended workspace of a settled run without rebuilding its pod', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();
        const manager = createWorkspaceManager({
            provider,
            clock,
            gcIntervalMs: 0,
            isSettled: async () => false,
            isSuspendable: async () => true,
        });
        const { workspace } = await manager.acquire('r1', {});
        const name = `chamvi-ws-${workspace.id}`;

        await manager.collectGarbage();
        expect(client.pods.has(name)).toBe(false);

        await manager.release('r1');
        expect(client.created).toHaveLength(1);
        expect(client.claims.has(name)).toBe(false);
    });

    it('a claim whose running pod cannot be read throws SandboxError and keeps claim and pod', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();
        const workspace = await provider.create({ runId: 'r1', repo: REPO });
        const name = `chamvi-ws-${workspace.id}`;
        const replica = provide(client, clock);

        failCheckoutReads(client);

        const error = await drive(replica.find('r1'), clock, CHECKOUT_READ_RETRY_MS).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(SandboxError);
        expect(client.claims.has(name)).toBe(true);
        expect(client.pods.has(name)).toBe(true);
        expect(client.deletedClaims).toEqual([]);
        expect(client.created).toHaveLength(1);
    });

    it('a claim whose pod went while its checkout was read is rebuilt once', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();
        const workspace = await provider.create({ runId: 'r1', repo: REPO });
        const name = `chamvi-ws-${workspace.id}`;
        const replica = provide(client, clock);
        let suspended = false;

        // another replica suspends the pod between the list and the read
        failCheckoutReads(client, (pod) => {
            if (!suspended) {
                suspended = true;
                client.pods.delete(pod);
            }

            return !client.pods.has(pod);
        });

        const found = await drive(replica.find('r1'), clock, CHECKOUT_READ_RETRY_MS);

        expect(found.map(({ id, info }) => ({ id, commit: info.commit }))).toEqual([{ id: workspace.id, commit: COMMIT }]);
        expect(client.created).toHaveLength(2);
        expect(client.pods.has(name)).toBe(true);
        expect(client.claims.has(name)).toBe(true);
    });

    it('a rebuilt pod whose checkout cannot be read throws SandboxError and keeps the claim', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();
        const workspace = await provider.create({ runId: 'r1', repo: REPO });
        const name = `chamvi-ws-${workspace.id}`;

        client.pods.delete(name);
        failCheckoutReads(client);

        const error = await drive(provide(client, clock).find('r1'), clock, CHECKOUT_READ_RETRY_MS).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(SandboxError);
        expect(client.claims.has(name)).toBe(true);
        expect(client.deletedClaims).toEqual([]);
    });

    it('a find with restore false answers a running claimed pod without reading its checkout', async () => {
        const {
            client, 
            clock, 
            provider, 
        } = setup();
        const workspace = await provider.create({ runId: 'r1', repo: REPO });
        const name = `chamvi-ws-${workspace.id}`;

        failCheckoutReads(client);

        const execs = client.execs.length;
        const found = await provide(client, clock).find('r1', { restore: false });

        expect(found.map(({ id }) => id)).toEqual([workspace.id]);
        expect(client.execs).toHaveLength(execs);

        await found[0]!.dispose();
        expect(client.pods.has(name)).toBe(false);
        expect(client.claims.has(name)).toBe(false);
    });

    it('a find during a suspension waits for its pod delete and rebuilds the pod', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1', repo: REPO });
        const name = `chamvi-ws-${workspace.id}`;
        const gate = gateDeletes(client);
        const collecting = provider.collectGarbage(waiting);

        while (!gate.called) {
            await flush();
        }

        const finding = provider.find('r1');

        await flush();
        gate.release();
        await collecting;

        const found = await finding;

        expect(found.map(({ id }) => id)).toEqual([workspace.id]);
        expect(found[0]).not.toBe(workspace);
        expect(client.created).toHaveLength(2);
        expect(client.pods.has(name)).toBe(true);
    });
});
