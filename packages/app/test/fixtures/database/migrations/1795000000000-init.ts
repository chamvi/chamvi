/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1795000000000 implements MigrationInterface {
    name = 'Init1795000000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('CREATE TABLE "fixture_authors" ("id" uuid NOT NULL, "name" character varying(128) NOT NULL, ' +
            'CONSTRAINT "fixture_authors_name_key" UNIQUE ("name"), CONSTRAINT "fixture_authors_pkey" PRIMARY KEY ("id"))');
        await queryRunner.query('CREATE TABLE "fixture_notes" ("id" uuid NOT NULL, "body" text NOT NULL, "publishedAt" TIMESTAMP, ' +
            '"createdAt" TIMESTAMP NOT NULL DEFAULT now(), "authorId" uuid NOT NULL, CONSTRAINT "fixture_notes_pkey" PRIMARY KEY ("id"))');
        await queryRunner.query('ALTER TABLE "fixture_notes" ADD CONSTRAINT "fixture_notes_author_fkey" FOREIGN KEY ("authorId") ' +
            'REFERENCES "fixture_authors"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "fixture_notes" DROP CONSTRAINT "fixture_notes_author_fkey"');
        await queryRunner.query('DROP TABLE "fixture_notes"');
        await queryRunner.query('DROP TABLE "fixture_authors"');
    }
}
