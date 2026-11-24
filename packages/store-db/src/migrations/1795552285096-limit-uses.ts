/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LimitUses1795552285096 implements MigrationInterface {
    name = 'LimitUses1795552285096';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chamvi_limit_uses" (
                "id" uuid NOT NULL,
                "scope" character varying(255) COLLATE "C" NOT NULL,
                "key" character varying(255) COLLATE "C" NOT NULL,
                "weight" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_0cd345b57bc21bf09bf144eecb5" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_27326b86de83e0914819e7dd8a" ON "chamvi_limit_uses" ("scope", "created_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_8f062f07f82b85612c0d91cd1d" ON "chamvi_limit_uses" ("scope", "key")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "IDX_8f062f07f82b85612c0d91cd1d"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_27326b86de83e0914819e7dd8a"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_limit_uses"
        `);
    }
}
