/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class KnowledgeVector1795037128304 implements MigrationInterface {
    name = 'KnowledgeVector1795037128304';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // the data source installs no extension on connect; down() keeps it, other schemas may use it
        await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
        await queryRunner.query(`
            CREATE TABLE "chamvi_vector_collections" (
                "id" uuid NOT NULL,
                "name" character varying(64) COLLATE "C" NOT NULL,
                "kind" character varying(16) NOT NULL,
                "trusted" boolean NOT NULL,
                "generation" integer NOT NULL,
                "model" character varying(255) NOT NULL,
                "dimensions" integer,
                "chunker" character varying(255) NOT NULL,
                "pending_generation" integer,
                "pending_model" character varying(255),
                "pending_dimensions" integer,
                "pending_chunker" character varying(255),
                "last_generation" integer,
                "status" character varying(16) NOT NULL,
                "error" text,
                "failures" integer,
                "retry_at" TIMESTAMP WITH TIME ZONE,
                "synced_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "fence" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_20bef941edbdbe17cf8d438d8b0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_55b9ba11078f9bf32d6caece17" ON "chamvi_vector_collections" ("name")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_vector_chunks" (
                "key" uuid NOT NULL,
                "collection_id" uuid NOT NULL,
                "document" character varying(255) COLLATE "C" NOT NULL,
                "generation" integer NOT NULL,
                "index" integer NOT NULL,
                "text" text NOT NULL,
                "start" integer NOT NULL,
                "end" integer NOT NULL,
                "embedding" vector NOT NULL,
                "title" text,
                "source" text,
                CONSTRAINT "PK_0e3fe82bf82dc2ea48c2af4895a" PRIMARY KEY ("key")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4a55bed7b7f84157898d558de2" ON "chamvi_vector_chunks" ("collection_id", "generation")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_660ddace8ff7fdb29dd4fa8bcd" ON "chamvi_vector_chunks" (
                "collection_id",
                "document",
                "generation",
                "index"
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_vector_documents" (
                "key" uuid NOT NULL,
                "collection_id" uuid NOT NULL,
                "id" character varying(255) COLLATE "C" NOT NULL,
                "content" text NOT NULL,
                "hash" character varying(255) NOT NULL,
                "title" text,
                "source" text,
                "metadata" jsonb,
                "status" character varying(16) COLLATE "C" NOT NULL,
                "error" text,
                "generation" integer NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_3303b32b464056ad6768178f0fd" PRIMARY KEY ("key")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_612e691f1136d590c81c29e365" ON "chamvi_vector_documents" ("collection_id", "status", "id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_32b7253a681a61e497760a5a3d" ON "chamvi_vector_documents" ("collection_id", "id")
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_vector_chunks"
            ADD CONSTRAINT "FK_a260ef72e99a1fc011854efaf12" FOREIGN KEY ("collection_id") REFERENCES "chamvi_vector_collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_vector_documents"
            ADD CONSTRAINT "FK_2dfa2116b676a765e61e1289a9a" FOREIGN KEY ("collection_id") REFERENCES "chamvi_vector_collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "chamvi_vector_documents" DROP CONSTRAINT "FK_2dfa2116b676a765e61e1289a9a"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_vector_chunks" DROP CONSTRAINT "FK_a260ef72e99a1fc011854efaf12"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_32b7253a681a61e497760a5a3d"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_612e691f1136d590c81c29e365"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_vector_documents"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_660ddace8ff7fdb29dd4fa8bcd"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_4a55bed7b7f84157898d558de2"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_vector_chunks"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_55b9ba11078f9bf32d6caece17"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_vector_collections"
        `);
    }
}
