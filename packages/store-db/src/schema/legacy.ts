/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, QueryRunner } from 'typeorm';
import { TableName } from '../entities/constants.ts';
import { LegacySchemaError } from '../error/legacy.ts';

const BASELINE_MIGRATION = 'UuidBaseline1794096000000';

// Conversations1792713600000 is the name the bundled ConversationsRunTaint had in development.
const LEGACY_MIGRATIONS = [
    'Init1792195200000',
    'Artifacts1792368000000',
    'IdempotencyScope1792454400000',
    'KvKeyCollation1792540800000',
    'AgentRevisions1792627200000',
    'ConversationsRunTaint1792713600000',
    'Conversations1792713600000',
    'RunLineage1792800000000',
    'Connections1792886400000',
];

async function holdsLegacySchema(dataSource: DataSource, queryRunner: QueryRunner): Promise<boolean> {
    const { schema } = dataSource.driver.options as { schema?: string };
    const migrationsTable = dataSource.driver.buildTableName(
        dataSource.options.migrationsTableName ?? 'migrations',
        schema,
        dataSource.driver.database,
    );

    if (await queryRunner.hasTable(migrationsTable)) {
        const rows: { name: string }[] = await dataSource.manager
            .createQueryBuilder(queryRunner)
            .select('m.name', 'name')
            .from(migrationsTable, 'm')
            .getRawMany();
        const names = new Set(rows.map((row) => row.name));

        if (names.has(BASELINE_MIGRATION)) {
            return false;
        }

        const recordedLegacy = LEGACY_MIGRATIONS.some((name) => names.has(name));

        if (recordedLegacy) {
            return true;
        }
    }

    for (const table of Object.values(TableName)) {
        if (await queryRunner.hasTable(table)) {
            return true;
        }
    }

    return false;
}

/**
 * Throws when the database holds a chamvi schema from before the uuid baseline.
 * Read-only: it never creates the migrations table. Pass the lock-holding query
 * runner to check on that connection, else one is taken and released.
 *
 * Temporary: remove in the chamvi version after the uuid baseline.
 */
export async function assertStoreNotLegacy(dataSource: DataSource, queryRunner?: QueryRunner): Promise<void> {
    const runner = queryRunner ?? dataSource.createQueryRunner();

    try {
        if (await holdsLegacySchema(dataSource, runner)) {
            throw new LegacySchemaError();
        }
    } finally {
        if (!queryRunner) {
            await runner.release();
        }
    }
}
