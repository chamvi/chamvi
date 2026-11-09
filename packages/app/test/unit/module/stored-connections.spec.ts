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
    createMemoryStore,
} from '@chamvi/core';
import type { IKeyring, IStore } from '@chamvi/core';
import {
    configModule,
    createLogger,
    engineModule,
    readStoredConnections,
    storeModule,
} from '@chamvi/app';
import { createModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness, ModuleHarnessOptions } from '@chamvi/app/testing';

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

async function harnessOf(store: IStore, options: Omit<ModuleHarnessOptions, 'modules'> = {}): Promise<ModuleHarness> {
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
            storeModule({ store }),
            engineModule(),
        ],
    });

    harnesses.push(harness);

    return harness;
}

async function seed(store: IStore, name: string, type: string, withKeyring: IKeyring = keyring): Promise<void> {
    await createConnectionConfigStore({ store, keyring: () => withKeyring }).create(name, type, {
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
        const store = createMemoryStore();

        await seed(store, 'mail-home', 'mail');
        await seed(store, 'calendar-home', 'calendar');

        const row = await store.connections!.findOneOrFail('mail-home');
        const harness = await harnessOf(store, { keyring });

        expect(await readStoredConnections(harness.container, 'mail')).toEqual([{
            name: 'mail-home',
            values: { host: 'h', password: SECRET },
            revision: 1,
            createdAt: row.createdAt,
        }]);
    });

    it('returns nothing for a store without connections', async () => {
        const store: IStore = createMemoryStore();

        delete store.connections;

        const harness = await harnessOf(store);

        expect(await readStoredConnections(harness.container, 'mail')).toEqual([]);
    });

    it('names the connection when a row cannot be decrypted, never a value', async () => {
        const store = createMemoryStore();

        await seed(store, 'mail-home', 'mail', createKeyring([{ id: 'k1', key: randomBytes(32) }]));

        const harness = await harnessOf(store, { keyring });
        const error = await rejectionOf(readStoredConnections(harness.container, 'mail'));

        expect(error.message).toContain('mail-home');
        expect(error.message).not.toContain(SECRET);
    });

    it('names the connection and the variable when stored secrets meet no keyring', async () => {
        const store = createMemoryStore();

        await seed(store, 'mail-home', 'mail');

        const harness = await harnessOf(store);
        const error = await rejectionOf(readStoredConnections(harness.container, 'mail'));

        expect(error.message).toContain('mail-home');
        expect(error.message).toContain('CHAMVI_ENCRYPTION_KEYS');
    });

    it('names the connection for a driver failure, without the driver text', async () => {
        const store = createMemoryStore();

        await seed(store, 'mail-home', 'mail');
        store.connections!.findConfig = async () => {
            throw new Error('driver text');
        };

        const harness = await harnessOf(store, { keyring });
        const error = await rejectionOf(readStoredConnections(harness.container, 'mail'));

        expect(error.message).toContain('mail-home');
        expect(error.message).not.toContain('driver text');
    });

    it('in a check, warns and returns nothing when the list meets a behind schema', async () => {
        const store = createMemoryStore();

        store.connections!.find = async () => {
            throw behindSchemaError();
        };

        const harness = await harnessOf(store, { check: true });

        expect(await readStoredConnections(harness.container, 'mail')).toEqual([]);
        expect(logLines.some((line) => line.includes('behind'))).toBe(true);
    });

    it('in a check, warns and returns nothing when a row meets a behind schema', async () => {
        const store = createMemoryStore();

        await seed(store, 'mail-home', 'mail');
        store.connections!.findConfig = async () => {
            throw behindSchemaError();
        };

        const harness = await harnessOf(store, { check: true, keyring });

        expect(await readStoredConnections(harness.container, 'mail')).toEqual([]);
        expect(logLines.some((line) => line.includes('behind'))).toBe(true);
    });

    it('outside a check a behind schema fails', async () => {
        const store = createMemoryStore();

        store.connections!.find = async () => {
            throw behindSchemaError();
        };

        const harness = await harnessOf(store);

        await expect(readStoredConnections(harness.container, 'mail')).rejects.toThrow('does not exist');
    });
});
