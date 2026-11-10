/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import {
    InvalidAgentDefinitionError,
    createConnectionConfigStore,
    createKeyring,
    createMemoryStore,
} from '@chamvi/core';
import type {
    IConnectionConfigStore,
    IConnectionTypeProvider,
    IStore,
} from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    ENV_ENCRYPTION_KEYS,
    configModule,
    storeModule,
} from '@chamvi/app';
import type { Env } from '@chamvi/app';
import { buildHarness } from '../../utils/harness.ts';
import type { Harness, HarnessOptions } from '../../utils/harness.ts';
import { createRecordingLogger } from '../../utils/logger.ts';

const KEY = randomBytes(32);
const KEYS = `k1:${KEY.toString('base64')}`;
const PASSWORD = 'hunter2-plaintext-secret';

let harnesses: Harness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses = [];
});

/** A store shared with the app, as a database is between a start and a job. */
function createSeeds() {
    const clock = new ControllableClock(new Date('2026-11-09T00:00:00Z'));
    const store = createMemoryStore({ clock });
    const seeds = createConnectionConfigStore({
        store,
        clock,
        keyring: () => createKeyring([{ id: 'k1', key: KEY }]),
    });

    return {
        clock,
        store,
        seeds,
    };
}

async function boot(store: IStore, clock: ControllableClock, options: HarnessOptions = {}): Promise<IConnectionConfigStore> {
    const harness = buildHarness({
        modules: [configModule({ clock, logger: createRecordingLogger(clock) }), storeModule({ store })],
        ...options,
    });

    harnesses.push(harness);

    await harness.setup();

    return harness.container.resolve(AppToken.CONNECTION_CONFIGS);
}

/** An env that records which variables were read. */
function recordingEnv(values: Env): { env: Env; reads: string[] } {
    const reads: string[] = [];
    const env = new Proxy(values, {
        get(target, name, receiver) {
            if (typeof name === 'string') {
                reads.push(name);
            }

            return Reflect.get(target, name, receiver);
        },
    });

    return { env, reads };
}

describe('AppToken.CONNECTION_CONFIGS', () => {
    it('does not read CHAMVI_ENCRYPTION_KEYS until a secret is touched', async () => {
        const {
            store, 
            clock, 
            seeds, 
        } = createSeeds();

        await seeds.create('mail-work', 'mail', { settings: { host: 'imap.example.org' }, secrets: { set: { password: PASSWORD } } });

        const { env, reads } = recordingEnv({ [ENV_ENCRYPTION_KEYS]: KEYS });
        const configs = await boot(store, clock, { env });

        await expect(configs.describe('mail-work')).resolves.toMatchObject({ secretsSet: ['password'] });
        expect(reads).not.toContain(ENV_ENCRYPTION_KEYS);

        await expect(configs.read('mail-work')).resolves.toMatchObject({ values: { password: PASSWORD } });
        expect(reads).toContain(ENV_ENCRYPTION_KEYS);
    });

    it('builds one store per app', async () => {
        const { store, clock } = createSeeds();
        const harness = buildHarness({ modules: [configModule({ clock, logger: createRecordingLogger(clock) }), storeModule({ store })] });

        harnesses.push(harness);
        await harness.setup();

        expect(harness.container.resolve(AppToken.CONNECTION_CONFIGS)).toBe(harness.container.resolve(AppToken.CONNECTION_CONFIGS));
    });

    it('a save that needs a key without the variable is refused naming it', async () => {
        const { store, clock } = createSeeds();
        const configs = await boot(store, clock);

        await expect(configs.create('mail-work', 'mail', {})).rejects.toThrow(/CHAMVI_ENCRYPTION_KEYS is not set/);
        await expect(configs.describe('mail-work')).resolves.toBeUndefined();
    });

    it('fails when resolved, not at setup, on a store without connections', async () => {
        const { store, clock } = createSeeds();
        const harness = buildHarness({
            modules: [
                configModule({ clock, logger: createRecordingLogger(clock) }),
                storeModule({ store: { ...store, connections: undefined } }),
            ],
        });

        harnesses.push(harness);
        await harness.setup();

        expect(() => harness.container.resolve(AppToken.CONNECTION_CONFIGS)).toThrow(InvalidAgentDefinitionError);
    });

    it('a store a module registered first wins', async () => {
        const {
            store, 
            clock, 
            seeds, 
        } = createSeeds();
        const harness = buildHarness({
            modules: [
                {
                    name: 'custom-configs',
                    async setup(container) {
                        container.register(AppToken.CONNECTION_CONFIGS, { useValue: seeds });
                    },
                },
                configModule({ clock, logger: createRecordingLogger(clock) }),
                storeModule({ store }),
            ],
        });

        harnesses.push(harness);
        await harness.setup();

        expect(harness.container.resolve(AppToken.CONNECTION_CONFIGS)).toBe(seeds);
    });
});

describe('AppToken.CONNECTION_CONFIGS in a job', () => {
    it('a run-job start with no stored secrets needs no key', async () => {
        const {
            store, 
            clock, 
            seeds, 
        } = createSeeds();

        await seeds.create('mail-work', 'mail', { settings: { host: 'imap.example.org' } });

        const configs = await boot(store, clock, { mode: 'job', job: { agent: 'triage' } });

        await expect(configs.read('mail-work')).resolves.toMatchObject({ values: { host: 'imap.example.org' } });
    });

    it('run-job reads a stored secret when the key is set', async () => {
        const {
            store, 
            clock, 
            seeds, 
        } = createSeeds();

        await seeds.create('mail-work', 'mail', { secrets: { set: { password: PASSWORD } } });

        const configs = await boot(store, clock, {
            mode: 'job',
            job: { agent: 'triage' },
            env: { [ENV_ENCRYPTION_KEYS]: KEYS },
        });

        await expect(configs.read('mail-work')).resolves.toMatchObject({ values: { password: PASSWORD } });
    });

    it('run-job fails naming the variable for a stored secret without the key', async () => {
        const {
            store, 
            clock, 
            seeds, 
        } = createSeeds();

        await seeds.create('mail-work', 'mail', { secrets: { set: { password: PASSWORD } } });

        const configs = await boot(store, clock, { mode: 'job', job: { agent: 'triage' } });

        await expect(configs.read('mail-work')).rejects.toThrow(/CHAMVI_ENCRYPTION_KEYS is not set/);
    });
});

describe('AppToken.CONNECTION_TYPES', () => {
    it('collects the contributed providers', async () => {
        const provider: IConnectionTypeProvider = {
            definition: {
                type: 'mail',
                label: 'Mail',
                multiple: true,
                fields: [],
            },
            creatable: () => true,
            connections: () => [],
        };
        const harness = buildHarness({
            modules: [{
                name: 'provider',
                async setup(container) {
                    container.registerMany(AppToken.CONNECTION_TYPES, { useValue: provider });
                },
            }],
        });

        harnesses.push(harness);
        await harness.setup();

        expect(harness.container.resolveAll(AppToken.CONNECTION_TYPES)).toEqual([provider]);
    });
});
