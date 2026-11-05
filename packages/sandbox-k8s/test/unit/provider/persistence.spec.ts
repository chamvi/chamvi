/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { V1PersistentVolumeClaim, V1Pod } from '@kubernetes/client-node';
import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError, SandboxError } from '@chamvi/core';
import { createKubernetesSandbox } from '@chamvi/sandbox-k8s';
import type { KubernetesSandboxOptions } from '@chamvi/sandbox-k8s';
import { ControllableClock } from '@chamvi/test-kit';
import { createFakePodClient } from '../../utils/client.ts';

const START = 1_000_000;

const managed = {
    'app.kubernetes.io/managed-by': 'chamvi',
    'app.kubernetes.io/component': 'sandbox',
    'chamvi.dev/deployment': 'default',
};

const SELECTOR = 'app.kubernetes.io/managed-by=chamvi,app.kubernetes.io/component=sandbox,chamvi.dev/deployment=default';

function setup(options: Partial<KubernetesSandboxOptions> = { persistence: {} }) {
    const clock = new ControllableClock(new Date(START));
    const client = createFakePodClient();
    const provider = createKubernetesSandbox({
        namespace: 'agents',
        image: 'img',
        client,
        clock,
        ...options,
    });

    return {
        clock,
        client,
        provider,
    };
}

function metadata(id: string, runId: string, expiresAt: number) {
    return {
        name: `chamvi-ws-${id}`,
        labels: {
            ...managed,
            'chamvi.dev/run': runId,
            'chamvi.dev/workspace': id,
        },
        annotations: {
            'chamvi.dev/created-at': String(START),
            'chamvi.dev/expires-at': String(expiresAt),
            'chamvi.dev/image': 'img',
        },
    };
}

function seedClaim(client: ReturnType<typeof createFakePodClient>, id: string, runId: string, expiresAt: number): void {
    const claim: V1PersistentVolumeClaim = {
        metadata: metadata(id, runId, expiresAt),
        spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '4Gi' } } },
    };

    client.claims.set(claim.metadata!.name!, claim);
}

function seedPod(client: ReturnType<typeof createFakePodClient>, id: string, runId: string, expiresAt: number, phase = 'Running'): void {
    const pod: V1Pod = {
        metadata: metadata(id, runId, expiresAt),
        spec: { containers: [] },
        status: { phase },
    };

    client.pods.set(pod.metadata!.name!, pod);
}

describe('kubernetes persistence', () => {
    it('create makes the claim before the pod and mounts it', async () => {
        const { client, provider } = setup({ persistence: { storageClassName: 'fast-ssd', size: '10Gi' } });
        const order: string[] = [];
        const { create, createClaim } = client;

        client.createClaim = async (claim) => {
            order.push('claim');

            return createClaim!(claim);
        };
        client.create = async (pod) => {
            order.push('pod');

            return create(pod);
        };

        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;
        const claim = client.createdClaims[0]!;
        const pod = client.created[0]!;

        expect(order).toEqual(['claim', 'pod']);
        expect(claim.metadata!.name).toBe(name);
        expect(claim.metadata!.labels).toEqual(pod.metadata!.labels);
        expect(claim.metadata!.annotations).toEqual(pod.metadata!.annotations);
        expect(claim.spec).toEqual({
            accessModes: ['ReadWriteOnce'],
            storageClassName: 'fast-ssd',
            resources: { requests: { storage: '10Gi' } },
        });

        const volumes = pod.spec!.volumes!;
        const mounts = pod.spec!.containers[0]!.volumeMounts!;

        expect(volumes).toContainEqual({ name: 'workspace', persistentVolumeClaim: { claimName: name } });
        expect(volumes.map((volume) => volume.name)).not.toContain('home');
        expect(mounts).toContainEqual({
            name: 'workspace', 
            mountPath: '/workspace', 
            subPath: 'workspace', 
        });
        expect(mounts).toContainEqual({
            name: 'workspace', 
            mountPath: '/home/sandbox', 
            subPath: 'home', 
        });
        expect(pod.spec!.containers[0]!.resources!.limits!['ephemeral-storage']).toBe('4Gi');
    });

    it('sizes the claim after the resolved storage limit by default, in the cluster default class', async () => {
        const { client, provider } = setup({ persistence: {}, limits: { storage: '8Gi' } });

        await provider.create({ runId: 'r1', limits: { storage: '6Gi' } });
        expect(client.createdClaims[0]!.spec).toEqual({
            accessModes: ['ReadWriteOnce'],
            resources: { requests: { storage: '6Gi' } },
        });
    });

    it('makes no claim without persistence', async () => {
        const { client, provider } = setup({});
        const workspace = await provider.create({ runId: 'r1' });

        expect(client.createdClaims).toEqual([]);
        expect(client.created[0]!.spec!.volumes).toContainEqual({ name: 'home', emptyDir: {} });

        await workspace.dispose();
        expect(client.deletedClaims).toEqual([]);

        await provider.collectGarbage();
        expect(client.claimSelectors).toEqual([]);
    });

    it('a failed create deletes pod and claim', async () => {
        const { client, provider } = setup();

        client.statuses.push({ phase: 'Failed', reason: 'Evicted' });

        await expect(provider.create({ runId: 'r1' })).rejects.toBeInstanceOf(SandboxError);

        const name = client.createdClaims[0]!.metadata!.name!;

        expect(client.deleted).toEqual([name]);
        expect(client.deletedClaims).toEqual([name]);
        expect(client.claims.size).toBe(0);
    });

    it('a failed claim create deletes what it may have made', async () => {
        const { client, provider } = setup();

        client.createClaim = async () => {
            throw new SandboxError('cannot create claim: forbidden');
        };

        await expect(provider.create({ runId: 'r1' })).rejects.toThrow(/forbidden/);
        expect(client.created).toEqual([]);
        expect(client.deletedClaims).toHaveLength(1);
    });

    it('dispose deletes pod and claim', async () => {
        const { client, provider } = setup();
        const workspace = await provider.create({ runId: 'r1' });
        const name = `chamvi-ws-${workspace.id}`;

        await workspace.dispose();
        expect(client.deleted).toEqual([name]);
        expect(client.deletedClaims).toEqual([name]);
        expect(client.claims.size).toBe(0);
    });

    it('collection deletes an expired claim and a claim whose run settled, pod or not', async () => {
        const { client, provider } = setup();

        seedClaim(client, 'expired', 'r1', START);
        seedClaim(client, 'expired-pod', 'r1', START);
        seedPod(client, 'expired-pod', 'r1', START);
        seedClaim(client, 'settled', 'done', START + 60_000);
        seedClaim(client, 'settled-pod', 'done', START + 60_000);
        seedPod(client, 'settled-pod', 'done', START + 60_000);
        seedClaim(client, 'live', 'r1', START + 60_000);

        await expect(provider.collectGarbage({ isSettled: async (runId) => runId === 'done' })).resolves.toBe(4);
        expect(client.claimSelectors).toEqual([SELECTOR]);
        expect(client.deleted.sort()).toEqual(['chamvi-ws-expired-pod', 'chamvi-ws-settled-pod']);
        expect(client.deletedClaims.sort()).toEqual([
            'chamvi-ws-expired',
            'chamvi-ws-expired-pod',
            'chamvi-ws-settled',
            'chamvi-ws-settled-pod',
        ]);
        expect(client.claims.keys().toArray()).toEqual(['chamvi-ws-live']);
    });

    it('asks isSettled once per run for a claim and its pod', async () => {
        const { client, provider } = setup();
        const asked: string[] = [];

        seedClaim(client, 'w1', 'r1', START + 60_000);
        seedPod(client, 'w1', 'r1', START + 60_000);

        await provider.collectGarbage({
            isSettled: async (runId) => {
                asked.push(runId);

                return false;
            },
        });
        expect(asked).toEqual(['r1']);
    });

    it('keeps an unexpired claim of a live run without a pod', async () => {
        const { client, provider } = setup();

        seedClaim(client, 'suspended', 'r1', START + 60_000);

        await expect(provider.collectGarbage({ isSettled: async () => false })).resolves.toBe(0);
        expect(client.deletedClaims).toEqual([]);
        expect(client.claims.size).toBe(1);
    });

    it('deletes a failed pod but keeps the claim of its live run', async () => {
        const { client, provider } = setup();

        seedClaim(client, 'evicted', 'r1', START + 60_000);
        seedPod(client, 'evicted', 'r1', START + 60_000, 'Failed');

        await expect(provider.collectGarbage({ isSettled: async () => false })).resolves.toBe(1);
        expect(client.deleted).toEqual(['chamvi-ws-evicted']);
        expect(client.deletedClaims).toEqual([]);
    });

    it('disposes a workspace it holds before deleting its expired claim', async () => {
        const {
            client,
            clock,
            provider,
        } = setup();
        const workspace = await provider.create({ runId: 'r1', limits: { maxLifetimeMs: 60_000 } });

        clock.advance(60_000);

        await expect(provider.collectGarbage()).resolves.toBe(1);
        expect(workspace.disposed).toBe(true);
        expect(client.deleted).toEqual([`chamvi-ws-${workspace.id}`]);
        expect(client.deletedClaims).toEqual([`chamvi-ws-${workspace.id}`]);
    });

    it('keeps collecting past a claim it cannot delete and reports it once', async () => {
        const { client, provider } = setup();

        seedClaim(client, 'a', 'r1', START);
        seedClaim(client, 'b', 'r1', START);
        client.deleteClaim = async (name) => {
            if (name === 'chamvi-ws-a') {
                throw new SandboxError('cannot delete claim: forbidden');
            }

            client.deletedClaims.push(name);
            client.claims.delete(name);
        };

        const error = await provider.collectGarbage().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(SandboxError);
        expect((error as Error).message).toContain('forbidden');
        expect(client.deletedClaims).toEqual(['chamvi-ws-b']);
    });

    it('a workspace created without persistence is never suspended', async () => {
        const clock = new ControllableClock(new Date(START));
        const client = createFakePodClient();
        const before = createKubernetesSandbox({
            namespace: 'agents',
            image: 'img',
            client,
            clock,
        });
        const workspace = await before.create({ runId: 'r1' });
        const after = createKubernetesSandbox({
            namespace: 'agents',
            image: 'img',
            client,
            clock,
            persistence: {},
        });

        await expect(after.collectGarbage({
            isSettled: async () => false,
            isSuspendable: async () => true,
        })).resolves.toBe(0);
        expect(client.deleted).toEqual([]);
        expect(client.pods.has(`chamvi-ws-${workspace.id}`)).toBe(true);
    });

    it('persistence without claim methods on a custom client throws InvalidAgentDefinitionError', () => {
        for (const method of ['createClaim', 'deleteClaim', 'listClaims'] as const) {
            const client = createFakePodClient();

            delete client[method];

            expect(() => createKubernetesSandbox({
                namespace: 'agents',
                client,
                persistence: {},
            })).toThrow(InvalidAgentDefinitionError);
        }
    });

    it('a custom client without claim methods works without persistence', () => {
        const client = createFakePodClient();

        delete client.createClaim;
        delete client.deleteClaim;
        delete client.listClaims;

        expect(() => createKubernetesSandbox({ namespace: 'agents', client })).not.toThrow();
    });

    it('validates the persistence options', () => {
        for (const persistence of [
            null,
            'yes',
            { storageClassName: 'Not_A_Name' },
            { storageClassName: '' },
            { size: 'lots' },
            { size: '0' },
        ]) {
            expect(() => createKubernetesSandbox({
                namespace: 'agents',
                client: createFakePodClient(),
                persistence: persistence as never,
            })).toThrow(InvalidAgentDefinitionError);
        }
    });
});
