/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// Runs on the built packages (spawned by test/unit/app/lazy.spec.ts): an app
// with a database module, in the mode named by the first argument. The
// packages named in LAZY_FORBID (comma-separated) throw when loaded, as a
// driver that is not installed does. Prints the outcome and every module
// URL the process resolved, as JSON.
import { registerHooks } from 'node:module';
import { createServer } from 'node:net';

const resolved = new Set();
const forbidden = (process.env.LAZY_FORBID ?? '').split(',').filter((name) => name.length > 0);

registerHooks({
    resolve(specifier, context, nextResolve) {
        const refused = forbidden.some((name) => specifier === name || specifier.startsWith(`${name}/`));

        if (refused) {
            throw new Error(`Cannot find package '${specifier}'`);
        }

        const result = nextResolve(specifier, context);

        resolved.add(result.url);

        return result;
    },
});

const mode = process.argv[2];

const {
    createApp,
    configModule,
    databaseModule,
    readDatabaseDescriptors,
} = await import('@chamvi/app');
const { memoryStoreModule } = await import('@chamvi/app/testing');
const {
    Column,
    Entity,
    PrimaryColumn,
} = await import('typeorm');

// an entity as the compiler writes it, without decorator syntax
class LazyNoteEntity {}

PrimaryColumn({ type: 'varchar', length: 36 })(LazyNoteEntity.prototype, 'id');
Column({ type: 'text' })(LazyNoteEntity.prototype, 'body');
Entity({ name: 'lazy_notes' })(LazyNoteEntity);

const port = await new Promise((resolve) => {
    const server = createServer();

    server.listen(0, '127.0.0.1', () => {
        const { port: free } = server.address();

        server.close(() => resolve(free));
    });
});
const env = {
    HOST: '127.0.0.1',
    PORT: String(port),
    TOKENS: JSON.stringify([{
        value: 'x'.repeat(32),
        id: 'ops',
        permissions: '*',
    }]),
    CHAMVI_LOG_LEVEL: 'error',
    CHAMVI_DRAIN_TIMEOUT_MS: '1000',
    ...(process.env.LAZY_DATABASE_URL ? { DATABASE_URL: process.env.LAZY_DATABASE_URL } : {}),
};

const app = createApp({
    agents: [],
    modules: [
        configModule(),
        memoryStoreModule(),
        databaseModule({
            entities: [LazyNoteEntity],
            migrations: [],
            migrationsDirectory: new URL('./migrations/', import.meta.url),
            migrationsTableName: 'lazy_migrations',
        }),
    ],
});

const result = {};

if (mode === 'import') {
    result.descriptors = readDatabaseDescriptors(app).map((descriptor) => descriptor.name);
} else {
    try {
        await app.start({ env });

        result.started = true;
    } catch (error) {
        result.error = {
            code: error.code,
            operation: error.operation,
            message: error.message,
        };
    }

    await app.stop().catch(() => {});
}

process.stdout.write(`${JSON.stringify({ ...result, resolved: [...resolved] })}\n`);
