/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LockTokens1795093873329 implements MigrationInterface {
    name = 'LockTokens1795093873329';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chamvi_lock_tokens" (
                "id" smallint NOT NULL,
                "value" bigint NOT NULL,
                CONSTRAINT "PK_9c806b9fe1a8b835ebf6d24d695" PRIMARY KEY ("id")
            )
        `);

        // Backfill (edited): the generated `ADD "token" bigint NOT NULL` fails on a table with
        // rows, so the column is added nullable, filled with distinct tokens above the
        // database's wall clock in microseconds (the floor `nextToken()` issues from), then made
        // NOT NULL; the counter row starts at the highest of them.
        await queryRunner.query(`
            ALTER TABLE "chamvi_locks"
            ADD "token" bigint
        `);
        await queryRunner.query(`
            UPDATE "chamvi_locks" AS "lock"
            SET "token" = "numbered"."floor" + "numbered"."position"
            FROM (
                SELECT "id",
                    row_number() OVER (ORDER BY "id") AS "position",
                    (extract(epoch from clock_timestamp()) * 1000000)::bigint AS "floor"
                FROM "chamvi_locks"
            ) AS "numbered"
            WHERE "lock"."id" = "numbered"."id"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_locks"
            ALTER COLUMN "token" SET NOT NULL
        `);
        await queryRunner.query(`
            INSERT INTO "chamvi_lock_tokens" ("id", "value")
            SELECT 1, GREATEST(COALESCE(max("token"), 0), (extract(epoch from clock_timestamp()) * 1000000)::bigint)
            FROM "chamvi_locks"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "chamvi_locks" DROP COLUMN "token"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_lock_tokens"
        `);
    }
}
