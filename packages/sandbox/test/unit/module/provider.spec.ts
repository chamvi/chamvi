/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DEFAULT_SANDBOX_IMAGE } from '@chamvi/sandbox';
import type { ISandboxProvider, IWorkspace } from '@chamvi/sandbox';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { SandboxModule } from '@chamvi/sandbox/module';
import type { SandboxModuleOptions } from '@chamvi/sandbox/module';
import { describe, expect, it } from 'vitest';
import { createLazyProvider } from '../../../src/module/provider.ts';

function inner(): ISandboxProvider & { creates: number; calls: unknown[][] } {
    const provider = {
        name: 'inner',
        creates: 0,
        calls: [] as unknown[][],
        async create() {
            provider.creates += 1;

            return { id: `ws-${provider.creates}` } as unknown as IWorkspace;
        },
        async find(runId: string, options?: unknown) {
            provider.calls.push(['find', runId, options]);

            return [];
        },
        async collectGarbage(options?: unknown) {
            provider.calls.push(['collectGarbage', options]);

            return 3;
        },
    };

    return provider;
}

describe('createLazyProvider', () => {
    it('has the given name before loading', () => {
        const provider = createLazyProvider('k8s', async () => inner());

        expect(provider.name).toBe('k8s');
    });

    it('loads once, concurrent creates share it', async () => {
        let loads = 0;
        const target = inner();
        const provider = createLazyProvider('local', async () => {
            loads += 1;
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });

            return target;
        });

        const [a, b] = await Promise.all([
            provider.create({ runId: 'r1' }),
            provider.create({ runId: 'r2' }),
        ]);

        await provider.load();
        expect(loads).toBe(1);
        expect(target.creates).toBe(2);
        expect([a.id, b.id].sort()).toEqual(['ws-1', 'ws-2']);
        expect(await provider.collectGarbage()).toBe(3);
        expect(loads).toBe(1);
    });

    it('forwards find and the garbage collection options', async () => {
        const target = inner();
        const provider = createLazyProvider('docker', async () => target);
        const isSettled = async () => true;

        expect(await provider.find('r1', { deployment: 'prod' })).toEqual([]);
        expect(await provider.collectGarbage({ deployment: 'prod', isSettled })).toBe(3);
        expect(target.calls).toEqual([
            ['find', 'r1', { deployment: 'prod' }],
            ['collectGarbage', { deployment: 'prod', isSettled }],
        ]);
    });

    it('a failed load is not cached', async () => {
        let loads = 0;
        const provider = createLazyProvider('local', async () => {
            loads += 1;

            if (loads === 1) {
                throw new Error('boom');
            }

            return inner();
        });

        await expect(provider.load()).rejects.toThrow('boom');
        await provider.load();
        expect(loads).toBe(2);
    });
});

/** Records the options each provider factory gets instead of importing the package. */
class FactoryRecordingModule extends SandboxModule {
    factories: Array<[string, unknown]> = [];

    protected override async importPackage<T>(): Promise<T> {
        const record = (factory: string) => (options?: unknown) => {
            this.factories.push([factory, options]);

            return inner();
        };

        return {
            createLocalSandbox: record('local'),
            createDockerSandbox: record('docker'),
            createKubernetesSandbox: record('kubernetes'),
        } as T;
    }

    async load(): Promise<Array<[string, unknown]>> {
        await this.lazy!.load();

        return this.factories;
    }
}

function kubernetes(env: Record<string, string>, options: SandboxModuleOptions = {}): FactoryRecordingModule {
    return new FactoryRecordingModule({
        ...options,
        env: {
            CHAMVI_SANDBOX_PROVIDER: 'kubernetes',
            CHAMVI_SANDBOX_NAMESPACE: 'sb',
            ...env,
        },
    });
}

describe('sandboxModule: provider factory options', () => {
    it('passes CHAMVI_SANDBOX_PERSISTENCE and CHAMVI_SANDBOX_STORAGE_CLASS to the kubernetes provider', async () => {
        const module = kubernetes({ CHAMVI_SANDBOX_PERSISTENCE: 'true', CHAMVI_SANDBOX_STORAGE_CLASS: 'fast' });

        expect(await module.load()).toEqual([['kubernetes', {
            namespace: 'sb',
            image: DEFAULT_SANDBOX_IMAGE,
            persistence: { storageClassName: 'fast' },
        }]]);
    });

    it('persistence without a storage class uses the cluster default', async () => {
        const module = kubernetes({ CHAMVI_SANDBOX_PERSISTENCE: 'true' });

        expect(await module.load()).toEqual([['kubernetes', {
            namespace: 'sb',
            image: DEFAULT_SANDBOX_IMAGE,
            persistence: {},
        }]]);
    });

    it('no persistence by default, also with a storage class alone', async () => {
        expect(await kubernetes({}).load()).toEqual([['kubernetes', { namespace: 'sb', image: DEFAULT_SANDBOX_IMAGE }]]);
        expect(await kubernetes({ CHAMVI_SANDBOX_STORAGE_CLASS: 'fast' }).load())
            .toEqual([['kubernetes', { namespace: 'sb', image: DEFAULT_SANDBOX_IMAGE }]]);
    });

    it('the persistence option, with the storage class of the env winning', async () => {
        const module = kubernetes(
            { CHAMVI_SANDBOX_STORAGE_CLASS: 'fast' },
            { persistence: { storageClassName: 'slow', size: '10Gi' } },
        );

        expect(await module.load()).toEqual([['kubernetes', {
            namespace: 'sb',
            image: DEFAULT_SANDBOX_IMAGE,
            persistence: { storageClassName: 'fast', size: '10Gi' },
        }]]);
    });

    it('CHAMVI_SANDBOX_PERSISTENCE=false wins over the option', async () => {
        const module = kubernetes({ CHAMVI_SANDBOX_PERSISTENCE: 'false' }, { persistence: { size: '10Gi' } });

        expect(await module.load()).toEqual([['kubernetes', { namespace: 'sb', image: DEFAULT_SANDBOX_IMAGE }]]);
    });

    it('an invalid CHAMVI_SANDBOX_PERSISTENCE names the variable', () => {
        expect(() => kubernetes({ CHAMVI_SANDBOX_PERSISTENCE: 'yes' }))
            .toThrow(new InvalidAgentDefinitionError('CHAMVI_SANDBOX_PERSISTENCE must be one of true, false, 1, 0.'));
    });

    it('ignores the persistence variables for another provider', async () => {
        const module = new FactoryRecordingModule({
            env: {
                CHAMVI_SANDBOX_PROVIDER: 'docker',
                CHAMVI_SANDBOX_PERSISTENCE: 'yes',
                CHAMVI_SANDBOX_STORAGE_CLASS: 'fast',
            },
        });

        expect(await module.load()).toEqual([['docker', { image: DEFAULT_SANDBOX_IMAGE }]]);
    });
});
