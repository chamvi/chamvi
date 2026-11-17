/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Tags1795000000001 implements MigrationInterface {
    name = 'Tags1795000000001';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('CREATE TABLE "fixture_tags" ("name" character varying(64) NOT NULL, CONSTRAINT "fixture_tags_pkey" PRIMARY KEY ("name"))');
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "fixture_tags"');
    }
}
