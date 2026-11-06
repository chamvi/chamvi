/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Connections1792886400000 implements MigrationInterface {
    name = 'Connections1792886400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chamvi_connections" (
                "name" character varying(64) COLLATE "C" NOT NULL,
                "type" character varying(64) NOT NULL,
                "key_id" character varying(64) NOT NULL,
                "wrapped_key" bytea NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_e7686bb29a31182711655bf5bb7" PRIMARY KEY ("name")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_connection_entries" (
                "connection_name" character varying(64) COLLATE "C" NOT NULL,
                "key" character varying(255) COLLATE "C" NOT NULL,
                "value" bytea NOT NULL,
                CONSTRAINT "PK_6617c764ab669582a4f80c343ea" PRIMARY KEY ("connection_name", "key")
            )
        `);
        await queryRunner.query('ALTER TABLE "chamvi_connection_entries" ADD CONSTRAINT "FK_5f7fb05d2504ede0bd561b737ca" FOREIGN KEY ("connection_name") REFERENCES "chamvi_connections"("name") ON DELETE CASCADE ON UPDATE NO ACTION');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "chamvi_connection_entries" DROP CONSTRAINT "FK_5f7fb05d2504ede0bd561b737ca"');
        await queryRunner.query('DROP TABLE "chamvi_connection_entries"');
        await queryRunner.query('DROP TABLE "chamvi_connections"');
    }
}
