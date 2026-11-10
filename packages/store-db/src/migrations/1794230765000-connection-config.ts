/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ConnectionConfig1794230765000 implements MigrationInterface {
    name = 'ConnectionConfig1794230765000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chamvi_connection_secrets" (
                "id" uuid NOT NULL,
                "connection_id" uuid NOT NULL,
                "name" character varying(64) COLLATE "C" NOT NULL,
                "value" bytea NOT NULL,
                CONSTRAINT "PK_cebeba00759d34a6b63e6ca0513" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_294edffc5e68d10e3e32339f4c" ON "chamvi_connection_secrets" ("connection_id", "name")
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_connections"
            ADD "settings" jsonb NOT NULL DEFAULT '{}'
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_connections"
            ADD "config_revision" integer NOT NULL DEFAULT '0'
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_connection_secrets"
            ADD CONSTRAINT "FK_f6e23b1935645922ecaad02791c" FOREIGN KEY ("connection_id") REFERENCES "chamvi_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "chamvi_connection_secrets" DROP CONSTRAINT "FK_f6e23b1935645922ecaad02791c"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_connections" DROP COLUMN "config_revision"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_connections" DROP COLUMN "settings"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_294edffc5e68d10e3e32339f4c"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_connection_secrets"
        `);
    }
}
