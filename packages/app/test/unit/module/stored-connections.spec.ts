/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    createConnectionConfigStore,
    createKeyring,
} from '@chamvi/core';
import type { ConnectionTypeDefinition, IKeyring } from '@chamvi/core';
import {
    configModule,
    createLogger,
    engineModule,
    readStoredConnections,
    resolveStoredConnection,
} from '@chamvi/app';
import type { StoredConnection } from '@chamvi/app';
import { createModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness, ModuleHarnessOptions } from '@chamvi/app/testing';
import { createTestStore, storeModuleOf } from '../../utils/store.ts';
import type { TestStore } from '../../utils/store.ts';

const SECRET = 'stored-secret-password';
const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);

const harnesses: ModuleHarness[] = [];
const logLines: string[] = [];

afterEach(async () => {
    logLines.length = 0;

    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }
});

async function harnessOf(store: Omit<TestStore, 'connectionRepository'> & { connectionRepository: TestStore['connectionRepository'] | null }, options: Omit<ModuleHarnessOptions, 'modules'> = {}): Promise<ModuleHarness> {
    const harness = await createModuleHarness({
        ...options,
        modules: [
            configModule({
                logger: createLogger({
                    level: 'warn',
                    write: (line) => {
                        logLines.push(line);
                    },
                }),
            }),
            storeModuleOf(store),
            engineModule(),
        ],
    });

    harnesses.push(harness);

    return harness;
}

async function seed(store: TestStore, name: string, type: string, withKeyring: IKeyring = keyring): Promise<void> {
    await createConnectionConfigStore({
        connectionService: store.connectionService,
        lockService: store.lockService,
        keyring: () => withKeyring,
    }).create(name, type, {
        settings: { host: 'h' },
        secrets: { set: { password: SECRET } },
    });
}

function behindSchemaError(): Error {
    return Object.assign(new Error('relation "connection" does not exist'), { driverError: { code: '42P01' } });
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        return error as Error;
    }

    throw new Error('expected a rejection');
}

describe('readStoredConnections()', () => {
    it('returns the rows of the type with their values, revision and creation time', async () => {
        const store = createTestStore();

        await seed(store, 'mail-home', 'mail');
        await seed(store, 'calendar-home', 'calendar');

        const row = await store.connectionService.findOneOrFail('mail-home');
        const harness = await harnessOf(store, { keyring });

        expect(await readStoredConnections(harness.container, 'mail')).toEqual([{
            name: 'mail-home',
            values: { host: 'h', password: SECRET },
            revision: 1,
            createdAt: row.createdAt,
        }]);
    });

    it('with a name, reads only that row and skips an unreadable row of another name', async () => {
        const store = createTestStore();

        await seed(store, 'mail-old', 'mail', createKeyring([{ id: 'k1', key: randomBytes(32) }]));
        await seed(store, 'mail-home', 'mail');

        const harness = await harnessOf(store, { keyring });

        expect(await readStoredConnections(harness.container, 'mail', { name: 'mail-home' })).toEqual([expect.objectContaining({
            name: 'mail-home',
            values: { host: 'h', password: SECRET },
        })]);
        expect(logLines.some((line) => line.includes('mail-old'))).toBe(false);
        expect(await readStoredConnections(harness.container, 'mail', { name: 'mail-none' })).toEqual([]);
    });

    it('returns nothing for a store without connections', async () => {
        const store = { ...createTestStore(), connectionRepository: null };

        const harness = await harnessOf(store);

        expect(await readStoredConnections(harness.container, 'mail')).toEqual([]);
    });

    it('returns an undecryptable row with its settings only, marked unreadable, and keeps reading the others', async () => {
        const store = createTestStore();

        await seed(store, 'mail-old', 'mail', createKeyring([{ id: 'k1', key: randomBytes(32) }]));
        await seed(store, 'mail-home', 'mail');

        const old = await store.connectionService.findOneOrFail('mail-old');
        const harness = await harnessOf(store, { keyring });
        const rows = await readStoredConnections(harness.container, 'mail');

        expect(rows).toHaveLength(2);
        expect(rows).toEqual(expect.arrayContaining([
            {
                name: 'mail-old',
                values: { host: 'h' },
                revision: 1,
                createdAt: old.createdAt,
                unreadable: {
                    secrets: ['password'],
                    reason: expect.stringContaining('decryption_failed'),
                },
            },
            expect.objectContaining({ name: 'mail-home', values: { host: 'h', password: SECRET } }),
        ]));
        expect(JSON.stringify(rows.find((row) => row.name === 'mail-old'))).not.toContain(SECRET);
        expect(logLines.some((line) => line.includes('mail-old') && line.includes('decryption_failed'))).toBe(true);
        expect(logLines.join('\n')).not.toContain(SECRET);
    });

    it('marks a row with stored secrets unreadable without CHAMVI_ENCRYPTION_KEYS, naming the variable', async () => {
        const store = createTestStore();

        await seed(store, 'mail-home', 'mail');

        const harness = await harnessOf(store);
        const [row] = await readStoredConnections(harness.container, 'mail');

        expect(row).toMatchObject({
            name: 'mail-home',
            values: { host: 'h' },
            unreadable: { secrets: ['password'], reason: expect.stringContaining('CHAMVI_ENCRYPTION_KEYS') },
        });
    });

    it('a malformed CHAMVI_ENCRYPTION_KEYS still fails, naming the connection and the variable', async () => {
        const store = createTestStore();

        await seed(store, 'mail-home', 'mail');

        const harness = await harnessOf(store, { env: { CHAMVI_ENCRYPTION_KEYS: 'not-a-keyring' } });
        const error = await rejectionOf(readStoredConnections(harness.container, 'mail'));

        expect(error.message).toContain('mail-home');
        expect(error.message).toContain('CHAMVI_ENCRYPTION_KEYS');
        expect(error.message).not.toContain('not-a-keyring');
    });

    it('names the connection for a driver failure, without the driver text', async () => {
        const store = createTestStore();

        await seed(store, 'mail-home', 'mail');
        // the config read of a row reads its secrets
        store.connectionRepository.secrets.findManyBy = async () => {
            throw new Error('driver text');
        };

        const harness = await harnessOf(store, { keyring });
        const error = await rejectionOf(readStoredConnections(harness.container, 'mail'));

        expect(error.message).toContain('mail-home');
        expect(error.message).not.toContain('driver text');
    });

    it('in a check, warns and returns nothing when the list meets a behind schema', async () => {
        const store = createTestStore();

        store.connectionRepository.findMany = async () => {
            throw behindSchemaError();
        };

        const harness = await harnessOf(store, { check: true });

        expect(await readStoredConnections(harness.container, 'mail')).toEqual([]);
        expect(logLines.some((line) => line.includes('behind'))).toBe(true);
    });

    it('in a check, warns and returns nothing when a row meets a behind schema', async () => {
        const store = createTestStore();

        await seed(store, 'mail-home', 'mail');
        // the config read of a row reads its secrets
        store.connectionRepository.secrets.findManyBy = async () => {
            throw behindSchemaError();
        };

        const harness = await harnessOf(store, { check: true, keyring });

        expect(await readStoredConnections(harness.container, 'mail')).toEqual([]);
        expect(logLines.some((line) => line.includes('behind'))).toBe(true);
    });

    it('outside a check a behind schema fails', async () => {
        const store = createTestStore();

        store.connectionRepository.findMany = async () => {
            throw behindSchemaError();
        };

        const harness = await harnessOf(store);

        await expect(readStoredConnections(harness.container, 'mail')).rejects.toThrow('does not exist');
    });
});

describe('resolveStoredConnection()', () => {
    const definition: ConnectionTypeDefinition = {
        type: 'mail',
        label: 'Mail',
        multiple: true,
        fields: [
            {
                key: 'host',
                label: 'Host',
                kind: 'string',
                required: true,
                env: () => 'MAIL_HOST',
            },
            {
                key: 'password',
                label: 'Password',
                kind: 'secret',
                required: true,
                env: () => 'MAIL_PASSWORD',
            },
        ],
    };
    const row = (unreadable?: StoredConnection['unreadable']): StoredConnection => ({
        name: 'mail-home',
        values: unreadable ? { host: 'h' } : { host: 'h', password: SECRET },
        revision: 1,
        createdAt: new Date(0),
        ...(unreadable && { unreadable }),
    });
    const unreadable = { secrets: ['password'], reason: 'The stored secrets cannot be read (decryption_failed).' };
    const resolve = (env: Record<string, string>, input: StoredConnection | undefined) => resolveStoredConnection({
        definition,
        name: 'mail-home',
        readVariable: (variable) => env[variable],
    }, input);

    it('resolves a readable row as resolveConnection() does', () => {
        expect(resolve({}, row())).toMatchObject({
            state: 'configured',
            values: { host: 'h', password: SECRET },
            sources: { host: { kind: 'store' }, password: { kind: 'store' } },
        });
        expect(resolve({}, undefined)).toMatchObject({ state: 'not_configured' });
    });

    it('a secret only the unreadable row holds leaves the connection failed, with the reason and without the secret', () => {
        const resolved = resolve({}, row(unreadable));

        expect(resolved).toMatchObject({
            state: 'failed',
            reason: unreadable.reason,
            values: { host: 'h' },
            missing: [],
        });
        expect(Object.hasOwn(resolved.values, 'password')).toBe(false);
    });

    it('a gap only the unreadable row fills is no deployment error while another field comes from env', () => {
        expect(resolve({ MAIL_HOST: 'env-host' }, row(unreadable))).toMatchObject({
            state: 'failed',
            values: { host: 'env-host' },
        });
    });

    it('env setting every unreadable secret leaves the connection configured', () => {
        expect(resolve({ MAIL_PASSWORD: 'env-password' }, row(unreadable))).toMatchObject({
            state: 'configured',
            values: { host: 'h', password: 'env-password' },
            sources: { password: { kind: 'env', variable: 'MAIL_PASSWORD' } },
        });
    });
});
