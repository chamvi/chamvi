/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isObject } from 'smob';
import { DatabaseOptionsError } from '../error/options.ts';
import { MIGRATION_LOCK_NAME, STORE_ENTITIES, STORE_MIGRATIONS } from '../schema/constants.ts';
import { DATABASE_LOCK_PREFIX, STORE_DATABASE } from './constants.ts';
import type { MigrationDescriptor, MigrationTarget } from './types.ts';

const PACKAGE_NAME = '@chamvi/store-db';

/** Where chamvi's own migrations live in the package's sources, beside its package.json. */
const STORE_MIGRATIONS_SOURCE = path.join('src', 'migrations');

/**
 * chamvi's own migrations folder, when this code runs from the sources
 * of the chamvi repository (or its build beside them): the package's
 * root (the nearest package.json named `@chamvi/store-db` above this
 * file) holds `src/migrations/index.ts`. A published package ships
 * `dist` only, so from an app's `node_modules` this is undefined.
 */
export function storeMigrationsDirectory(from: string = fileURLToPath(import.meta.url)): string | undefined {
    let dir = path.dirname(from);

    for (;;) {
        try {
            const manifest: unknown = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));

            if (isObject(manifest) && manifest.name === PACKAGE_NAME) {
                const folder = path.join(dir, STORE_MIGRATIONS_SOURCE);

                return existsSync(path.join(folder, 'index.ts')) ? folder : undefined;
            }
        } catch {
            // no (readable) package.json here
        }

        const parent = path.dirname(dir);

        if (parent === dir) {
            return undefined;
        }

        dir = parent;
    }
}

/** chamvi's own store: its entities, migrations, lock and migrations table, as `migrateStore` uses them. */
export function storeTarget(directory: string | undefined = storeMigrationsDirectory()): MigrationTarget {
    return {
        name: STORE_DATABASE,
        entities: [...STORE_ENTITIES],
        migrations: [...STORE_MIGRATIONS],
        migrationsDirectory: directory,
        migrationsTableName: undefined,
        lockName: MIGRATION_LOCK_NAME,
        store: true,
    };
}

function toTarget(descriptor: MigrationDescriptor): MigrationTarget {
    return {
        name: descriptor.name,
        entities: [...descriptor.entities],
        migrations: [...descriptor.migrations],
        migrationsDirectory: descriptor.migrationsDirectory,
        migrationsTableName: descriptor.migrationsTableName,
        // a descriptor of an older @chamvi/app has none: the lock its module migrates under
        lockName: descriptor.lockName || `${DATABASE_LOCK_PREFIX}${descriptor.name}`,
        store: false,
    };
}

function listed(descriptors: readonly MigrationDescriptor[]): string {
    return [...descriptors.map((descriptor) => descriptor.name), STORE_DATABASE].map((name) => `"${name}"`).join(', ');
}

/**
 * The database `--database` selects: `store` for chamvi's own, else the
 * app's database of that name; without one the app's only database.
 * Refused (`DatabaseOptionsError`): no database module, an unknown name,
 * several databases and no name.
 */
export function selectTarget(descriptors: readonly MigrationDescriptor[], database: string | undefined): MigrationTarget {
    if (database === STORE_DATABASE) {
        return storeTarget();
    }

    if (database !== undefined) {
        const descriptor = descriptors.find((candidate) => candidate.name === database);

        if (!descriptor) {
            throw new DatabaseOptionsError(`The app has no database "${database}"; --database takes one of ${listed(descriptors)}.`);
        }

        return toTarget(descriptor);
    }

    if (descriptors.length === 0) {
        throw new DatabaseOptionsError(
            `The app has no database module (databaseModule()); pass --database ${STORE_DATABASE} for chamvi's own store.`,
        );
    }

    if (descriptors.length > 1) {
        throw new DatabaseOptionsError(`The app has several databases; pass --database with one of ${listed(descriptors)}.`);
    }

    return toTarget(descriptors[0]!);
}
