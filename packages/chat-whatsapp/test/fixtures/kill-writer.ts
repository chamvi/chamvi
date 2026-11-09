/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// The kill -9 child: holds the WhatsApp session of a Postgres connection and
// writes Baileys-shaped batches until the parent kills it. Each batch is one
// keys.set: a `session` marker `batch:<n>` and 20 `pre-key` entries
// `<n>.<i>`; a line `committed <n>` follows every durable batch.

import { DataSource } from 'typeorm';
import { createConnectionVault, createKeyring, parseKeyring } from '@chamvi/core';
import { STORE_ENTITIES, createDatabaseStore } from '@chamvi/store-db';
import { createStoreWhatsAppAuth } from '@chamvi/chat-whatsapp';

const env = (name: string): string => {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not set`);
    }

    return value;
};

const dataSource = new DataSource({
    type: 'postgres',
    host: env('KILL_PG_HOST'),
    port: Number(env('KILL_PG_PORT')),
    username: env('KILL_PG_USER'),
    password: env('KILL_PG_PASSWORD'),
    database: env('KILL_PG_DATABASE'),
    entities: STORE_ENTITIES,
});

await dataSource.initialize();

const store = createDatabaseStore({ dataSource });
const auth = createStoreWhatsAppAuth({
    vault: createConnectionVault({ store, keyring: createKeyring(parseKeyring(env('KILL_KEYRING'))) }),
    connection: 'bot',
    owner: 'writer',
    leaseTtlMs: Number(env('KILL_TTL_MS')),
});
const lease = await auth.acquire(new AbortController().signal);

await lease.saveCreds();
process.stdout.write('acquired\n');

for (let n = 0; n < 200; n++) {
    const preKeys: Record<string, { public: Uint8Array; private: Uint8Array }> = {};

    for (let i = 0; i < 20; i++) {
        preKeys[`${n}.${i}`] = { public: new Uint8Array(32).fill(n % 256), private: new Uint8Array(32).fill(i) };
    }

    await lease.auth.keys.set({
        session: { [`batch:${n}`]: new Uint8Array([n % 256]) },
        'pre-key': preKeys,
    });
    process.stdout.write(`committed ${n}\n`);
}

process.stdout.write('done\n');
