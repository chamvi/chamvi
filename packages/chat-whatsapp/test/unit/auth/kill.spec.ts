/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { afterAll, expect, it } from 'vitest';
import {
    ConnectionHeldError,
    createConnectionVault,
    createKeyring,
    parseKeyring,
} from '@chamvi/core';
import {
    STORE_ENTITIES,
    STORE_MIGRATIONS,
    createDatabaseStore,
    migrateStore,
} from '@chamvi/store-db';
import { createStoreWhatsAppAuth } from '@chamvi/chat-whatsapp';
import { createTestDatabase, describePostgres, postgres } from '../../utils/database.ts';

const TTL_MS = 2000;
const BATCHES = 200;
const KEYS_PER_BATCH = 20;

const sources: DataSource[] = [];

afterAll(async () => {
    await Promise.all(sources.map((source) => source.destroy()));
});

/** Spawns the writer and SIGKILLs it once `after` batches are committed; resolves with the last committed batch. */
function runWriter(env: Record<string, string>, after: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [
            '--import',
            new URL('../../fixtures/kill-hooks.ts', import.meta.url).href,
            fileURLToPath(new URL('../../fixtures/kill-writer.ts', import.meta.url)),
        ], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
        let committed = -1;
        let buffer = '';
        let stderr = '';
        let killed = false;

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            buffer += chunk;

            const lines = buffer.split('\n');

            buffer = lines.pop() ?? '';

            for (const line of lines) {
                const match = /^committed (\d+)$/.exec(line);

                if (match) {
                    committed = Number(match[1]);
                }

                if (!killed && committed + 1 >= after) {
                    killed = true;
                    child.kill('SIGKILL');
                }
            }
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
        });
        child.on('exit', (code, signal) => {
            if (signal === 'SIGKILL') {
                resolve(committed);
            } else {
                reject(new Error(`the writer exited with ${code} before it was killed: ${stderr}`));
            }
        });
    });
}

describePostgres('a holder killed with SIGKILL mid-stream', () => {
    it('leaves every batch all-or-nothing and the session to a new holder after the ttl', async () => {
        const database = await createTestDatabase();
        const dataSource = new DataSource({
            type: 'postgres',
            ...postgres!,
            database,
            entities: STORE_ENTITIES,
            migrations: STORE_MIGRATIONS,
        });

        await dataSource.initialize();
        sources.push(dataSource);
        await migrateStore(dataSource);

        const keyringValue = `k1:${randomBytes(32).toString('base64')}`;
        const lastCommitted = await runWriter({
            KILL_PG_HOST: postgres!.host,
            KILL_PG_PORT: String(postgres!.port),
            KILL_PG_USER: postgres!.username,
            KILL_PG_PASSWORD: postgres!.password,
            KILL_PG_DATABASE: database,
            KILL_KEYRING: keyringValue,
            KILL_TTL_MS: String(TTL_MS),
        }, 50);
        const killedAt = Date.now();

        expect(lastCommitted).toBeGreaterThanOrEqual(49);

        const store = createDatabaseStore({ dataSource });
        const auth = createStoreWhatsAppAuth({
            vault: createConnectionVault({ store, keyring: createKeyring(parseKeyring(keyringValue)) }),
            connection: 'bot',
            owner: 'successor',
            leaseTtlMs: TTL_MS,
        });

        // the dead holder's lease still blocks within its ttl
        await expect(auth.acquire(new AbortController().signal)).rejects.toBeInstanceOf(ConnectionHeldError);

        await sleep(Math.max(0, killedAt + TTL_MS + 100 - Date.now()));

        const lease = await auth.acquire(new AbortController().signal);
        const batches = Array.from({ length: BATCHES }, (_, n) => n);
        const markers = await lease.auth.keys.get('session', batches.map((n) => `batch:${n}`));
        const ids = batches.flatMap((n) => Array.from({ length: KEYS_PER_BATCH }, (_, i) => `${n}.${i}`));
        const preKeys = await lease.auth.keys.get('pre-key', ids);
        const present = batches.filter((n) => markers[`batch:${n}`] !== undefined);

        // every committed batch is there, the batches form a prefix (writes are serialized)
        expect(present.length).toBeGreaterThanOrEqual(lastCommitted + 1);
        expect(present).toEqual(batches.slice(0, present.length));

        for (const n of batches) {
            const keys = Array.from({ length: KEYS_PER_BATCH }, (_, i) => preKeys[`${n}.${i}`]);
            const count = keys.filter((key) => key !== undefined).length;

            // all or nothing, matching its marker
            expect(count, `batch ${n}`).toBe(present.includes(n) ? KEYS_PER_BATCH : 0);
        }

        // the session opens: creds as the writer saved them, keys decrypt
        expect(lease.auth.creds.noiseKey.private).toBeInstanceOf(Uint8Array);
        expect(Buffer.from(preKeys['0.3']!.private)).toEqual(Buffer.alloc(32, 3));

        await lease.auth.keys.set({ session: { after: new Uint8Array([1]) } });
        await lease.release();
    }, 60_000);
});
