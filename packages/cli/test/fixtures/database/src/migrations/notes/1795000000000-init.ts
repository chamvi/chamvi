import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1795000000000 implements MigrationInterface {
    name = 'Init1795000000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('CREATE TABLE "notes" ("id" character varying(36) NOT NULL, "title" character varying(200) NOT NULL, PRIMARY KEY ("id"))');
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "notes"');
    }
}
