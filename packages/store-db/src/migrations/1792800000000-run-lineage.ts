/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RunLineage1792800000000 implements MigrationInterface {
    name = 'RunLineage1792800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD "subtree_usage" jsonb');
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD "parent_run_id" character varying(128) COLLATE "C"');
        await queryRunner.query(`
            UPDATE "chamvi_runs"
            SET "parent_run_id" = "trigger"->'parent'->>'runId'
            WHERE "trigger"->'parent'->>'runId' IS NOT NULL
        `);
        // A hand-off parent is a dispatch of the role `handoff`.
        await queryRunner.query(`
            UPDATE "chamvi_runs"
            SET "trigger" = jsonb_set(
                jsonb_set("trigger", '{parent,kind}', '"dispatch"'),
                '{parent,role}',
                '"handoff"'
            )
            WHERE "trigger"->'parent'->>'kind' = 'handoff'
        `);
        // A pending approval keeps its generic wait id, so a guard on the wait id still matches it.
        await queryRunner.query(`
            UPDATE "chamvi_runs"
            SET "waiting" = jsonb_set("waiting", '{id}', "waiting"->'approvalId')
            WHERE "waiting" IS NOT NULL AND NOT "waiting" ? 'id' AND "waiting" ? 'approvalId'
        `);
        await queryRunner.query('CREATE INDEX "IDX_099dba5007e83a7ad85d75ec83" ON "chamvi_runs" ("parent_run_id") ');
        // Older stores may hold children whose parent run is gone. Keep those rows while enforcing new references.
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD CONSTRAINT "FK_099dba5007e83a7ad85d75ec83c" FOREIGN KEY ("parent_run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "chamvi_runs"
            SET "waiting" = "waiting" - 'id'
            WHERE "waiting"->>'kind' = 'approval'
        `);
        await queryRunner.query(`
            UPDATE "chamvi_runs"
            SET "trigger" = jsonb_set("trigger", '{parent}', (("trigger"->'parent') - 'role') || '{"kind":"handoff"}'::jsonb)
            WHERE "trigger"->'parent'->>'kind' = 'dispatch'
        `);
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP CONSTRAINT "FK_099dba5007e83a7ad85d75ec83c"');
        await queryRunner.query('DROP INDEX "IDX_099dba5007e83a7ad85d75ec83"');
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP COLUMN "parent_run_id"');
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP COLUMN "subtree_usage"');
    }
}
