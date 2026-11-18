/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ConnectionsRevisionsItemBytes1794230765000 implements MigrationInterface {
    name = 'ConnectionsRevisionsItemBytes1794230765000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // connection settings and sealed secrets
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

        // the agent revision a permission-checked run is bound to
        await queryRunner.query(`
            ALTER TABLE "chamvi_runs"
            ADD "agent_revision" character varying(128)
        `);

        // Backfill (edited): the generated `ADD "bytes" integer NOT NULL` fails on a table
        // with rows, so the column is added nullable, filled, then made NOT NULL.
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items"
            ADD "bytes" integer
        `);

        // The service stores Buffer.byteLength(text, 'utf8'). On a UTF8 database
        // octet_length(text) is that number (and reads the TOAST header only, never the
        // text); any other server encoding stores other bytes, so it converts to UTF-8 first.
        const [setting]: { server_encoding: string }[] = await queryRunner.query('SHOW server_encoding');
        const length = setting?.server_encoding === 'UTF8' ? 'octet_length("text")' : 'octet_length(convert_to("text", \'UTF8\'))';

        await queryRunner.query(`
            UPDATE "chamvi_conversation_items"
            SET "bytes" = ${length}
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items"
            ALTER COLUMN "bytes" SET NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items" DROP COLUMN "bytes"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_runs" DROP COLUMN "agent_revision"
        `);
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
