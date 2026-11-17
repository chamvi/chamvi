/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MigrationExecutor } from 'typeorm';
import type { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';
import { generateMigration, getSchemaDrift, withDatabaseLock } from 'typeorm-extension';
import { closeDatabase, connectDatabase } from '../database/connect.ts';
import { assertLockName, toConfigurationError, toUnavailable } from '../database/helpers.ts';
import { migrateDatabase } from '../database/migrate.ts';
import { buildDatabaseOptions } from '../database/options.ts';
import { LegacySchemaError } from '../error/legacy.ts';
import { DatabaseOptionsError } from '../error/options.ts';
import { migrateStore } from '../schema/module.ts';
import {
    MIGRATION_CLASS_NAME_PATTERN,
    MIGRATION_CONNECT_TIMEOUT_MS,
    MIGRATION_OPERATIONS,
} from './constants.ts';
import {
    assertScratchConnection,
    assertScratchDisposable,
    dropScratch,
    parseScratchUrl,
    recreateScratch,
    scratchConnection,
} from './scratch.ts';
import { selectTarget } from './target.ts';
import type { MigrationOperationInput, MigrationTarget, ScratchDatabase } from './types.ts';

type Context = {
    input: MigrationOperationInput;
    target: MigrationTarget;
    connectTimeoutMs: number;
};

/** `AddNoteRating` as a file name: `add-note-rating`. */
function kebabCase(name: string): string {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}

/** The name of a migration instance, as TypeORM records it. */
function migrationName(migration: { name?: string; constructor: { name: string } }): string {
    return migration.name ?? migration.constructor.name;
}

/** TypeORM reads a migration's timestamp from the last 13 digits of its name and orders by it. */
function timestampOf(name: string): number {
    return Number(/(\d{13})$/.exec(name)?.[1] ?? 0);
}

/** Where an operation connects: `DATABASE_URL`, or the scratch database by its one parse. */
type Connection = { url: string } | { scratch: ScratchDatabase; scratchUrl: string };

function targetOptions(context: Context, url: string): DataSourceOptions {
    const { target, connectTimeoutMs } = context;

    if (target.store) {
        // as the app's store module builds chamvi's data source
        return {
            type: 'postgres',
            url,
            entities: target.entities,
            migrations: target.migrations,
            migrationsRun: false,
            synchronize: false,
            logging: false,
            connectTimeoutMS: connectTimeoutMs,
        };
    }

    return buildDatabaseOptions({
        url,
        production: false,
        mode: 'migrate',
        entities: target.entities,
        migrations: target.migrations,
        migrationsTableName: target.migrationsTableName!,
        connectTimeoutMs,
    }).options;
}

/**
 * The target's data source options on `connection`. On the scratch
 * database the URL is dropped and the explicit options of its one parse
 * take its place (the URL carried nothing else: `parseScratchUrl` refuses
 * every other query parameter). `readOnly` keeps TypeORM from installing
 * the extensions the entities' column types need.
 */
function optionsOf(context: Context, connection: Connection, readOnly: boolean): DataSourceOptions {
    const options = targetOptions(context, 'url' in connection ? connection.url : connection.scratchUrl);
    const extensions = readOnly ? { installExtensions: false } : {};

    if ('url' in connection) {
        return { ...options, ...extensions } as DataSourceOptions;
    }

    const rest: Record<string, unknown> = { ...options };

    delete rest.url;

    return {
        ...rest,
        ...scratchConnection(connection.scratch),
        ...extensions,
    } as DataSourceOptions;
}

function requireUrl(context: Context): string {
    const { url } = context.input;

    if (url === undefined || url.length === 0) {
        throw new DatabaseOptionsError(`DATABASE_URL is required: ${context.input.operation} works on the database it names.`);
    }

    return url;
}

async function withConnection<R>(
    context: Context,
    connection: Connection,
    fn: (dataSource: DataSource) => Promise<R>,
    readOnly = false,
): Promise<R> {
    const dataSource = await connectDatabase(optionsOf(context, connection, readOnly));

    try {
        return await fn(dataSource);
    } finally {
        await closeDatabase(dataSource);
    }
}

/** Runs `fn` with an executor on one connection that holds the target's advisory lock. */
async function withLockedExecutor<R>(
    context: Context,
    dataSource: DataSource,
    fn: (executor: MigrationExecutor, queryRunner: QueryRunner) => Promise<R>,
): Promise<R> {
    assertLockName(context.target.lockName);

    const queryRunner = dataSource.createQueryRunner();

    try {
        return await withDatabaseLock(queryRunner, context.target.lockName, async () => {
            const executor = new MigrationExecutor(dataSource, queryRunner);

            executor.transaction = 'each';

            return fn(executor, queryRunner);
        });
    } finally {
        await queryRunner.release();
    }
}

/**
 * Runs the pending migrations: the store's through `migrateStore` (its
 * lock, the legacy check, one transaction each), an app's through
 * `migrateDatabase`, both under their lock; the names of those this call
 * ran, decided under the lock.
 */
async function migrate(context: Context, dataSource: DataSource): Promise<string[]> {
    if (!context.target.store) {
        return migrateDatabase(dataSource, { lockName: context.target.lockName });
    }

    try {
        return await migrateStore(dataSource);
    } catch (error) {
        throw error instanceof LegacySchemaError ? error : (toConfigurationError(error) ?? toUnavailable('migrate', error));
    }
}

async function run(context: Context): Promise<number> {
    const { write } = context.input;

    return withConnection(context, { url: requireUrl(context) }, async (dataSource) => {
        // decided under the lock: a run that waited for another reports only what it ran itself
        const applied = await migrate(context, dataSource);

        if (applied.length === 0) {
            write(`The database "${context.target.name}" has no pending migrations.`);
        }

        applied.forEach((name) => write(`applied ${name}`));

        return 0;
    });
}

async function revert(context: Context): Promise<number> {
    const { write } = context.input;

    return withConnection(context, { url: requireUrl(context) }, async (dataSource) => {
        try {
            const reverted = await withLockedExecutor(context, dataSource, async (executor) => {
                const before = (await executor.getExecutedMigrations()).map((migration) => migration.name);

                if (before.length === 0) {
                    return undefined;
                }

                await executor.undoLastMigration();

                const after = new Set((await executor.getExecutedMigrations()).map((migration) => migration.name));

                return before.find((name) => !after.has(name));
            });

            write(reverted ? `reverted ${reverted}` : `The database "${context.target.name}" has no migration to revert.`);

            return 0;
        } catch (error) {
            throw toConfigurationError(error) ?? toUnavailable('revert', error);
        }
    });
}

async function status(context: Context): Promise<number> {
    const { write } = context.input;

    return withConnection(context, { url: requireUrl(context) }, async (dataSource) => {
        let executed: string[];

        try {
            // read-only: the migrations table is never created
            executed = await withLockedExecutor(context, dataSource, async (executor) => (await executor.getExecutedMigrations())
                .map((migration) => migration.name));
        } catch (error) {
            throw toConfigurationError(error) ?? toUnavailable('status', error);
        }

        const known = dataSource.migrations
            .map((migration) => migrationName(migration))
            .sort((a, b) => timestampOf(a) - timestampOf(b));
        const ran = new Set(executed);
        let pending = 0;

        for (const name of known) {
            if (!ran.has(name)) {
                pending += 1;
            }

            write(`${ran.has(name) ? '[x]' : '[ ]'} ${name}`);
        }

        for (const name of executed.filter((candidate) => !known.includes(candidate))) {
            write(`[x] ${name} (recorded, not among the database's migrations)`);
        }

        write(pending > 0 ?
            `The database "${context.target.name}" has ${pending} pending migration(s).` :
            `The database "${context.target.name}" is up to date.`);

        return pending > 0 ? 1 : 0;
    }, true);
}

async function drift(context: Context): Promise<number> {
    const { write } = context.input;

    return withConnection(context, { url: requireUrl(context) }, async (dataSource) => {
        let found;

        try {
            // read-only: it compares, it never synchronizes
            found = await getSchemaDrift(dataSource);
        } catch (error) {
            throw toConfigurationError(error) ?? toUnavailable('drift', error);
        }

        if (!found.exists) {
            write(`The database "${context.target.name}" matches its entities.`);

            return 0;
        }

        write(`The database "${context.target.name}" differs from its entities; these statements would reconcile it:`);
        // schema statements only: a statement's parameters are never printed
        found.up.forEach((statement) => write(`${statement.query};`));

        return 1;
    }, true);
}

function assertGenerate(context: Context): { name: string; directory: string } {
    const { name } = context.input;

    if (typeof name !== 'string' || !MIGRATION_CLASS_NAME_PATTERN.test(name)) {
        throw new DatabaseOptionsError('generate needs --name, the migration\'s class name in PascalCase (letters and digits, e.g. AddNoteRating).');
    }

    const directory = context.target.migrationsDirectory;

    if (directory === undefined) {
        throw new DatabaseOptionsError(
            'chamvi\'s own migrations ship with @chamvi/store-db: generate --database store writes them only in the chamvi repository ' +
            '(packages/store-db/src/migrations), not in an app.',
        );
    }

    return { name, directory };
}

async function generate(context: Context): Promise<number> {
    const { input } = context;
    const { name, directory } = assertGenerate(context);
    const scratch = parseScratchUrl(input.scratchUrl, input.url);
    const scratchUrl = input.scratchUrl!;

    const leftover = await assertScratchDisposable(scratch, context.connectTimeoutMs);

    const timestamp = (input.now ?? Date.now)();
    let content: string | undefined;
    let failure: unknown;

    await recreateScratch(scratch, leftover, context.connectTimeoutMs);

    try {
        content = await withConnection(context, { scratch, scratchUrl }, async (dataSource) => {
            // nothing is written before the server confirms the connection reached the marked scratch database
            await assertScratchConnection(dataSource, scratch);
            await migrate(context, dataSource);

            try {
                return (await generateMigration({
                    dataSource,
                    name,
                    timestamp,
                    prettify: true,
                    preview: true,
                })).content;
            } catch (error) {
                throw toConfigurationError(error) ?? toUnavailable('generate', error);
            }
        });
    } catch (error) {
        failure = error;
    }

    try {
        // nothing of it is kept: a database left behind could later be mistaken for the scratch one
        await dropScratch(scratch);
    } catch (error) {
        failure ??= error;
    }

    if (failure !== undefined) {
        throw failure;
    }

    if (content === undefined) {
        input.write(`The entities of the database "${context.target.name}" match its migrations: no changes.`);

        return 0;
    }

    const file = path.join(directory, `${timestamp}-${kebabCase(name)}.ts`);

    await mkdir(directory, { recursive: true });
    await writeFile(file, content, { flag: 'wx' });

    input.write(`wrote ${file}`);
    input.write(context.target.store ?
        `Add ${name}${timestamp} to src/migrations/index.ts and STORE_MIGRATIONS.` :
        `Add ${name}${timestamp} to the migrations of the database "${context.target.name}".`);

    return 0;
}

const OPERATIONS = {
    generate,
    run,
    revert,
    status,
    drift,
} as const;

/**
 * One `chamvi migration` operation on an app's database (a descriptor
 * `readDatabaseDescriptors()` read) or, with `database: 'store'`, on
 * chamvi's own store (its entities, migrations, `migrations` table and
 * lock `chamvi:migrations`):
 *
 * - `generate`: in the throwaway database `scratchUrl` names (refused
 *   when it names `url`'s database in any spelling, or the server
 *   reports a database generate did not create): drop and create it,
 *   run the migrations, compare with the entities, drop it again;
 *   writes `<timestamp>-<kebab name>.ts` (class `<Name><timestamp>`) into
 *   the migrations directory, or reports no changes. Never touches `url`.
 * - `run`, `revert`, `status`: on `url`, under the database's lock.
 * - `drift`: compares `url`'s schema with the entities, read-only,
 *   printing the statements that would reconcile them.
 *
 * Resolves with the exit code: 0 done, 1 drift found (`drift`) or
 * migrations pending (`status`). A misuse is a `DatabaseOptionsError`, a
 * failure of the database a `DatabaseUnavailableError` (the operation and
 * the driver's code only). No output line, error or message carries a
 * URL, a password, a statement's parameters or a row.
 */
export async function runMigrationOperation(input: MigrationOperationInput): Promise<number> {
    if (!MIGRATION_OPERATIONS.includes(input.operation)) {
        throw new DatabaseOptionsError(`The migration operation must be one of ${MIGRATION_OPERATIONS.join(', ')}.`);
    }

    const context: Context = {
        input,
        target: selectTarget(input.descriptors, input.database),
        connectTimeoutMs: input.connectTimeoutMs ?? MIGRATION_CONNECT_TIMEOUT_MS,
    };

    return OPERATIONS[input.operation](context);
}
