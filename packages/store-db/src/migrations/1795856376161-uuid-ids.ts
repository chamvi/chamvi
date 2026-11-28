/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A uuid v7 for the time `at` (an SQL timestamp expression): the 48-bit
 * millisecond prefix over a random v4, its version bits set to 7.
 * Raw SQL: TypeORM has no uuid v7 expression, and `uuidv7()` needs
 * PostgreSQL 18.
 */
function uuidV7Sql(at: string): string {
    return `encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid()) placing substring(int8send(floor(extract(epoch from ${at}) * 1000)::bigint) from 3) from 1 for 6), 52, 1), 53, 1), 'hex')::uuid`;
}

export class UuidIds1795856376161 implements MigrationInterface {
    name = 'UuidIds1795856376161';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "IDX_520ee8478aecbdd2416de5c891"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_cc871fd9bfee0f0af9eea663b0"
        `);

        // Edited: the generated statements drop the bigint `id` and add a new
        // `sequence`, renumbering the rows. The `id` is renamed to `sequence`
        // instead (its BIGSERIAL sequence with it), so every row keeps its value
        // and the counter continues above them; the uuid `id` is added nullable,
        // filled (timed by the row; `sequence` carries the order), then made NOT NULL.
        // The primary key is dropped first, so the rename leaves its name alone.
        await queryRunner.query(`
            ALTER TABLE "chamvi_steps" DROP CONSTRAINT "PK_78c3048e38422b1384366e48b5e"
        `);
        await queryRunner.renameColumn('chamvi_steps', 'id', 'sequence');
        await queryRunner.query(`
            ALTER TABLE "chamvi_steps"
            ADD "id" uuid
        `);
        await queryRunner.query(`
            UPDATE "chamvi_steps"
            SET "id" = ${uuidV7Sql('"started_at"')}
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_steps"
            ALTER COLUMN "id" SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_steps"
            ADD CONSTRAINT "PK_78c3048e38422b1384366e48b5e" PRIMARY KEY ("id")
        `);

        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items" DROP CONSTRAINT "PK_7582c3d3eafdb1c3d71c2d4e368"
        `);
        await queryRunner.renameColumn('chamvi_conversation_items', 'id', 'sequence');
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items"
            ADD "id" uuid
        `);
        await queryRunner.query(`
            UPDATE "chamvi_conversation_items"
            SET "id" = ${uuidV7Sql('"created_at"')}
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items"
            ALTER COLUMN "id" SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items"
            ADD CONSTRAINT "PK_7582c3d3eafdb1c3d71c2d4e368" PRIMARY KEY ("id")
        `);

        // Backfill (edited): the generated `ADD ... NOT NULL` columns fail on the
        // counter row, so `key` and the uuid `id` are added nullable, filled, then
        // made NOT NULL; the row keeps its value.
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens" DROP CONSTRAINT "PK_9c806b9fe1a8b835ebf6d24d695"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens" DROP COLUMN "id"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens"
            ADD "key" character varying(32) COLLATE "C"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens"
            ADD "id" uuid
        `);
        await queryRunner.query(`
            UPDATE "chamvi_lock_tokens"
            SET "key" = 'lock', "id" = ${uuidV7Sql('clock_timestamp()')}
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens"
            ALTER COLUMN "key" SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens"
            ALTER COLUMN "id" SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens"
            ADD CONSTRAINT "PK_9c806b9fe1a8b835ebf6d24d695" PRIMARY KEY ("id")
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_f497a15332f8e358c300fc69de" ON "chamvi_lock_tokens" ("key")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6dfef2e8838c98b963266523db" ON "chamvi_steps" ("run_id", "step_index", "sequence")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_fd8d89a8bf79d3f56aa26672bf" ON "chamvi_conversation_items" ("scope_id", "generation", "sequence")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "IDX_fd8d89a8bf79d3f56aa26672bf"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_6dfef2e8838c98b963266523db"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_f497a15332f8e358c300fc69de"
        `);

        // Edited: the uuid `id` is dropped and `sequence` renamed back to the
        // bigint `id` (its sequence with it), so every row gets its old value back.
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items" DROP CONSTRAINT "PK_7582c3d3eafdb1c3d71c2d4e368"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items" DROP COLUMN "id"
        `);
        await queryRunner.renameColumn('chamvi_conversation_items', 'sequence', 'id');
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items"
            ADD CONSTRAINT "PK_7582c3d3eafdb1c3d71c2d4e368" PRIMARY KEY ("id")
        `);

        await queryRunner.query(`
            ALTER TABLE "chamvi_steps" DROP CONSTRAINT "PK_78c3048e38422b1384366e48b5e"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_steps" DROP COLUMN "id"
        `);
        await queryRunner.renameColumn('chamvi_steps', 'sequence', 'id');
        await queryRunner.query(`
            ALTER TABLE "chamvi_steps"
            ADD CONSTRAINT "PK_78c3048e38422b1384366e48b5e" PRIMARY KEY ("id")
        `);

        // Backfill (edited): the counter row is `id` 1 again, added nullable, filled, then made NOT NULL.
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens" DROP CONSTRAINT "PK_9c806b9fe1a8b835ebf6d24d695"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens" DROP COLUMN "id"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens"
            ADD "id" smallint
        `);
        await queryRunner.query(`
            UPDATE "chamvi_lock_tokens"
            SET "id" = 1
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens"
            ALTER COLUMN "id" SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens"
            ADD CONSTRAINT "PK_9c806b9fe1a8b835ebf6d24d695" PRIMARY KEY ("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_lock_tokens" DROP COLUMN "key"
        `);

        // Edited: the generated statement lists the columns alphabetically; the index keeps its released order.
        await queryRunner.query(`
            CREATE INDEX "IDX_cc871fd9bfee0f0af9eea663b0" ON "chamvi_conversation_items" ("scope_id", "generation", "created_at", "id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_520ee8478aecbdd2416de5c891" ON "chamvi_steps" ("run_id", "step_index")
        `);
    }
}
