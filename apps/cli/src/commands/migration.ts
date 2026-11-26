/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import * as nodeModule from 'node:module';
import { envString, envUrl, readDatabaseDescriptors } from '@chamvi/app';
import type { DatabaseDescriptor, IApp } from '@chamvi/app';
import type * as storeDb from '@chamvi/store-db';
import { defineCommand } from 'citty';
import type { CommandDef } from 'citty';
import { MIGRATION_DEFAULT_APP_NOTICE } from '../entry/constants.ts';
import { loadEntryApp, resolveEntry } from '../entry/module.ts';
import { assertKnownArgs, createUsageError } from '../run/helpers.ts';
import type { CliContext } from '../run/types.ts';
import { isTypeScriptFile } from '../transform/module.ts';
import {
    DATABASE_URL_VARIABLE,
    ENTRY_ARG,
    MIGRATION_OPERATION_NAMES,
    NODE_ENV_VARIABLE,
    STORE_DATABASE_NAME,
} from './constants.ts';

const MIGRATION_ARGS = {
    operation: {
        type: 'positional',
        description: `One of ${MIGRATION_OPERATION_NAMES.join(', ')}`,
        valueHint: MIGRATION_OPERATION_NAMES.join('|'),
        required: true,
    },
    name: {
        type: 'string',
        description: 'generate: the migration\'s class name, in PascalCase',
        valueHint: 'Name',
    },
    database: {
        type: 'string',
        description: `The app's database (a databaseModule name; needed when there are several), or "${STORE_DATABASE_NAME}" for chamvi's own store`,
        valueHint: 'name',
    },
    entry: ENTRY_ARG,
} as const;

type StoreDb = typeof storeDb;

/** The value of a string option citty parsed: `''` for a bare flag, `false` for `--no-<flag>`; both are a usage error. */
function stringArg(value: unknown, flag: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || value.length === 0) {
        throw createUsageError(`--${flag} needs a value.`);
    }

    return value;
}

/** The app's databases: the entry is loaded (never started); `--database store` needs no app. */
async function readDescriptors(
    context: CliContext,
    operation: string,
    database: string | undefined,
    entryArg: unknown,
): Promise<readonly DatabaseDescriptor[]> {
    if (database === STORE_DATABASE_NAME) {
        if (entryArg !== undefined) {
            throw createUsageError(`--entry does not go with --database ${STORE_DATABASE_NAME}: chamvi's own store is the same in every app.`);
        }

        return [];
    }

    const generate = operation === 'generate';
    const entry = await resolveEntry({
        cwd: context.cwd,
        entry: entryArg as string | boolean | undefined,
        kind: generate ? 'source' : 'built',
    });

    if (generate && entry !== undefined && !isTypeScriptFile(entry)) {
        // a built entry's migrations directory is its dist folder, and the new file must be added to the sources
        throw createUsageError(`generate needs the TypeScript source entry (it writes a .ts migration into the sources): ${entry} is built.`);
    }

    const app: IApp = await loadEntryApp(entry, context, MIGRATION_DEFAULT_APP_NOTICE);

    return readDatabaseDescriptors(app);
}

/**
 * `chamvi migration <generate|run|revert|status|drift>`: the migrations
 * of an app's database module (`--database <name>`, the only one by
 * default) or of chamvi's own store (`--database store`). Loads the
 * entry without starting the app; `generate` builds the schema in the
 * throwaway database `MIGRATION_DATABASE_URL` names, the others
 * work on `DATABASE_URL`. Exit codes: 0 done, 1 drift found (`drift`),
 * migrations pending (`status`) or a database failure, 2 a misuse. No
 * signal handlers: Node's default ends it.
 */
export function createMigrationCommand(context: CliContext): CommandDef<typeof MIGRATION_ARGS> {
    return defineCommand({
        meta: {
            name: 'migration',
            description: 'Generate, run, revert, inspect and drift-check the migrations of an app\'s database or chamvi\'s store',
        },
        args: MIGRATION_ARGS,
        async run({ args }) {
            assertKnownArgs(args, MIGRATION_ARGS);

            const { operation } = args;

            if (!MIGRATION_OPERATION_NAMES.includes(operation)) {
                throw createUsageError(`The operation must be one of ${MIGRATION_OPERATION_NAMES.join(', ')}.`);
            }

            const name = stringArg(args.name, 'name');
            const database = stringArg(args.database, 'database');

            if (operation !== 'generate' && name !== undefined) {
                throw createUsageError('--name is for generate only.');
            }

            // it drops and creates databases: never where the app runs for real
            if (operation === 'generate' && envString(context.env, NODE_ENV_VARIABLE) === 'production') {
                throw createUsageError('generate is a development command: it is refused when NODE_ENV is production.');
            }

            (nodeModule as { setSourceMapsSupport?: (enabled: boolean) => void }).setSourceMapsSupport?.(true);

            const descriptors = await readDescriptors(context, operation, database, args.entry);

            // lazy: only the migration commands load TypeORM and typeorm-extension
            const db: StoreDb = await import('@chamvi/store-db');
            const url = envUrl(context.env, DATABASE_URL_VARIABLE, { protocols: db.POSTGRES_PROTOCOLS });
            // the development variable is read by generate only, so a malformed one never fails run, status or drift
            const scratchUrl = operation === 'generate' ?
                envUrl(context.env, db.MIGRATION_DATABASE_URL_VARIABLE, { protocols: db.POSTGRES_PROTOCOLS }) :
                undefined;

            let code: number;

            try {
                code = await db.runMigrationOperation({
                    operation: operation as Parameters<StoreDb['runMigrationOperation']>[0]['operation'],
                    descriptors,
                    ...(database !== undefined && { database }),
                    ...(name !== undefined && { name }),
                    ...(url !== undefined && { url }),
                    ...(scratchUrl !== undefined && { scratchUrl }),
                    write: (line) => context.stdout(`${line}\n`),
                });
            } catch (error) {
                // a misuse (no database module, an unknown --database, a refused scratch database) exits 2
                if (error instanceof db.DatabaseOptionsError) {
                    throw createUsageError(error.message);
                }

                throw error;
            }

            if (code !== 0) {
                context.setExitCode(code);
            }
        },
    });
}
