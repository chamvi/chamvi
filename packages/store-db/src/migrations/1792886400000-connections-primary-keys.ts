/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds surrogate keys without rewriting public IDs or their stored references. */
export class ConnectionsPrimaryKeys1792886400000 implements MigrationInterface {
    name = 'ConnectionsPrimaryKeys1792886400000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // PostgreSQL 17 has UUID v4 randomness; preserve its variant and 74 random bits below the v7 timestamp.
        await queryRunner.query(`CREATE FUNCTION chamvi_uuid_v7() RETURNS uuid
            LANGUAGE sql VOLATILE
            AS $uuid$
                SELECT (
                    lpad(to_hex(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint), 12, '0')
                    || '7' || substr(replace(gen_random_uuid()::text, '-', ''), 14)
                )::uuid
            $uuid$`);
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" DROP CONSTRAINT "FK_a7fd19281c5f361dc8473323752"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_items" DROP CONSTRAINT "FK_8252e57feb07d3d5c100772ca68"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" DROP CONSTRAINT "FK_c2faa5ef0df1ac2535bb888e088"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" DROP CONSTRAINT "FK_94f96115d14b407087799db2081"');
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP CONSTRAINT "FK_f52e3d9f9a700e00b7021682252"');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" DROP CONSTRAINT "FK_ef8111d766fe466a3b307675e08"');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" DROP CONSTRAINT "FK_4aac9035497a94deb8cdb39062e"');
        await queryRunner.query('ALTER TABLE "chamvi_steps" DROP CONSTRAINT "FK_ec83b59c000dc26e022836e98b7"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_items" DROP CONSTRAINT "FK_e3edf09ee4749bad2d7b394c830"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" DROP CONSTRAINT "FK_08699555ad0212cc26e73325b75"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" DROP CONSTRAINT "FK_9490b26a059a1d8b50e8c1b0e25"');
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP CONSTRAINT "FK_099dba5007e83a7ad85d75ec83c"');
        await queryRunner.query('CREATE TABLE "chamvi_connections" ("id" uuid NOT NULL DEFAULT chamvi_uuid_v7(), "name" character varying(64) COLLATE "C" NOT NULL, "type" character varying(64) NOT NULL, "key_id" character varying(64) NOT NULL, "wrapped_key" bytea NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_dca348520cf0cebbe56b461d421" PRIMARY KEY ("id"))');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_e7686bb29a31182711655bf5bb" ON "chamvi_connections"  ("name") ');
        await queryRunner.query('CREATE TABLE "chamvi_connection_entries" ("id" uuid NOT NULL DEFAULT chamvi_uuid_v7(), "connection_name" character varying(64) COLLATE "C" NOT NULL, "key" character varying(255) COLLATE "C" NOT NULL, "value" bytea NOT NULL, CONSTRAINT "PK_2691559008f1b2d24d6d85d49d8" PRIMARY KEY ("id"))');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_6617c764ab669582a4f80c343e" ON "chamvi_connection_entries"  ("connection_name", "key") ');
        await queryRunner.query('ALTER TABLE "chamvi_agent_revisions" ADD "id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_artifacts" ADD "row_id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" ADD "row_id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" ADD "identity_key" character varying(64) COLLATE "C"');
        await queryRunner.query('UPDATE "chamvi_conversations" SET "identity_key" = "id"');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" ALTER COLUMN "identity_key" SET NOT NULL');
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD "row_id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" ADD "id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_docs" ADD "row_id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_effects" ADD "id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_idempotency_keys" ADD "id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_kv" ADD "id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_locks" ADD "id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" ADD "id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" ADD "row_id" uuid NOT NULL DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_d355b7063fb6b3201e6d588b51" ON "chamvi_agent_revisions"  ("agent") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_c4156e692873ba7401c7f3c01f" ON "chamvi_artifacts"  ("id") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_61f10c9ae0957d3767ab0385b8" ON "chamvi_conversations"  ("identity_key") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_d70b087b46b044fb4d5ff1b20b" ON "chamvi_conversations"  ("id") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_67c46d73ab47a75030de671b99" ON "chamvi_runs"  ("id") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_81d04b278cc4d8446e79f0a4d9" ON "chamvi_docs"  ("agent", "collection", "id") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_8cc0d748902d79a0d7085fbee9" ON "chamvi_effects"  ("key") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_445a24224c943565e32a837fff" ON "chamvi_idempotency_keys"  ("scope", "key") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_d200648cfdd2ef6370c92bc668" ON "chamvi_kv"  ("agent", "key") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_04f7fb6103a362aea272a1acb0" ON "chamvi_locks"  ("key") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_ff451484f567e3a78070456dc5" ON "chamvi_conversation_notes"  ("scope_id", "generation", "key") ');
        await queryRunner.query('CREATE UNIQUE INDEX "IDX_af30e6589f62e346f814c64cdd" ON "chamvi_conversation_operations"  ("scope_id", "generation", "id") ');
        await queryRunner.query('ALTER TABLE "chamvi_docs" DROP CONSTRAINT "PK_4295fefb3d07b2b59edd03bb7e5"');
        await queryRunner.query('ALTER TABLE "chamvi_docs" ADD CONSTRAINT "PK_7e25d40ab71a09ce9864bb9edda" PRIMARY KEY ("row_id")');
        await queryRunner.query('ALTER TABLE "chamvi_effects" DROP CONSTRAINT "PK_7fb2e468cabe232a81c1b268f34"');
        await queryRunner.query('ALTER TABLE "chamvi_effects" ADD CONSTRAINT "PK_01368b6901ca421676b3be52b5d" PRIMARY KEY ("id")');
        await queryRunner.query('ALTER TABLE "chamvi_idempotency_keys" DROP CONSTRAINT "PK_2627332526e8e1c262f044d0cb8"');
        await queryRunner.query('ALTER TABLE "chamvi_idempotency_keys" ADD CONSTRAINT "PK_602fae226ae5e7db4b6158c8473" PRIMARY KEY ("id")');
        await queryRunner.query('ALTER TABLE "chamvi_kv" DROP CONSTRAINT "PK_d233cd69d8b336316095d52d725"');
        await queryRunner.query('ALTER TABLE "chamvi_kv" ADD CONSTRAINT "PK_99915fcddccffdc73fe9a78b3c0" PRIMARY KEY ("id")');
        await queryRunner.query('ALTER TABLE "chamvi_locks" DROP CONSTRAINT "PK_836a0a3a636b596077033fda072"');
        await queryRunner.query('ALTER TABLE "chamvi_locks" ADD CONSTRAINT "PK_ef8ef2a3ae9f4e24736ca6b974b" PRIMARY KEY ("id")');
        await queryRunner.query('ALTER TABLE "chamvi_artifacts" DROP CONSTRAINT "PK_3bb29abbf8721c61b09142bd6ce"');
        await queryRunner.query('ALTER TABLE "chamvi_artifacts" ADD CONSTRAINT "PK_7e208ad7eaf520738f0988b8667" PRIMARY KEY ("row_id")');
        await queryRunner.query('ALTER TABLE "chamvi_agent_revisions" DROP CONSTRAINT "PK_d355b7063fb6b3201e6d588b511"');
        await queryRunner.query('ALTER TABLE "chamvi_agent_revisions" ADD CONSTRAINT "PK_3ffcbf4ff17329f80927c909bd7" PRIMARY KEY ("id")');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" DROP CONSTRAINT "PK_d70b087b46b044fb4d5ff1b20be"');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" ADD CONSTRAINT "PK_19e7c354e5ccfc709c28a0a7b2b" PRIMARY KEY ("row_id")');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" DROP CONSTRAINT "PK_d0549bdaf44100277f3573561cb"');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" ADD CONSTRAINT "PK_f86f29cfcedf01ecbb7074fe17d" PRIMARY KEY ("id")');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" DROP CONSTRAINT "PK_ff451484f567e3a78070456dc53"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" ADD CONSTRAINT "PK_14b0601fe95040761873d7eb428" PRIMARY KEY ("id")');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" DROP CONSTRAINT "PK_af30e6589f62e346f814c64cdde"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" ADD CONSTRAINT "PK_7af6cccadc3bcf705c4a9f8f8bf" PRIMARY KEY ("row_id")');
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP CONSTRAINT "PK_a2178a599d194316d8202924a52"');
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD CONSTRAINT "PK_bfa1bbf079fc97d59a0b028c93b" PRIMARY KEY ("row_id")');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" ADD CONSTRAINT "UQ_4aac9035497a94deb8cdb39062e" UNIQUE ("run_id")');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" ALTER COLUMN "id" SET DEFAULT chamvi_uuid_v7()');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" ADD CONSTRAINT "FK_ef8111d766fe466a3b307675e08" FOREIGN KEY ("active_run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD CONSTRAINT "FK_f52e3d9f9a700e00b7021682252" FOREIGN KEY ("conversation_scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD CONSTRAINT "FK_099dba5007e83a7ad85d75ec83c" FOREIGN KEY ("parent_run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" ADD CONSTRAINT "FK_4aac9035497a94deb8cdb39062e" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" ADD CONSTRAINT "FK_a7fd19281c5f361dc8473323752" FOREIGN KEY ("conversation_scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_connection_entries" ADD CONSTRAINT "FK_5f7fb05d2504ede0bd561b737ca" FOREIGN KEY ("connection_name") REFERENCES "chamvi_connections"("name") ON DELETE CASCADE ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_steps" ADD CONSTRAINT "FK_ec83b59c000dc26e022836e98b7" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_items" ADD CONSTRAINT "FK_8252e57feb07d3d5c100772ca68" FOREIGN KEY ("scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_items" ADD CONSTRAINT "FK_e3edf09ee4749bad2d7b394c830" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" ADD CONSTRAINT "FK_c2faa5ef0df1ac2535bb888e088" FOREIGN KEY ("scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" ADD CONSTRAINT "FK_08699555ad0212cc26e73325b75" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" ADD CONSTRAINT "FK_94f96115d14b407087799db2081" FOREIGN KEY ("scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" ADD CONSTRAINT "FK_9490b26a059a1d8b50e8c1b0e25" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Older runtimes cannot resolve new scope identities or replay the v7 artifact naming scheme.
        await queryRunner.query(`DO $guard$
            BEGIN
                IF EXISTS (SELECT 1 FROM "chamvi_conversations" WHERE "id" <> "identity_key")
                    OR EXISTS (SELECT 1 FROM "chamvi_runs" WHERE "id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
                    OR EXISTS (SELECT 1 FROM "chamvi_idempotency_keys" WHERE "run_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
                    OR EXISTS (SELECT 1 FROM "chamvi_artifacts" WHERE "run_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
                    RAISE EXCEPTION 'Cannot roll back UUID identities after new runs, reservations, artifacts or conversations have been created. Restore a pre-upgrade backup to downgrade.';
                END IF;
            END
            $guard$`);
        await queryRunner.query('ALTER TABLE "chamvi_conversations" DROP CONSTRAINT "FK_ef8111d766fe466a3b307675e08"');
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP CONSTRAINT "FK_f52e3d9f9a700e00b7021682252"');
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP CONSTRAINT "FK_099dba5007e83a7ad85d75ec83c"');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" DROP CONSTRAINT "FK_4aac9035497a94deb8cdb39062e"');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" DROP CONSTRAINT "FK_a7fd19281c5f361dc8473323752"');
        await queryRunner.query('ALTER TABLE "chamvi_connection_entries" DROP CONSTRAINT "FK_5f7fb05d2504ede0bd561b737ca"');
        await queryRunner.query('ALTER TABLE "chamvi_steps" DROP CONSTRAINT "FK_ec83b59c000dc26e022836e98b7"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_items" DROP CONSTRAINT "FK_8252e57feb07d3d5c100772ca68"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_items" DROP CONSTRAINT "FK_e3edf09ee4749bad2d7b394c830"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" DROP CONSTRAINT "FK_c2faa5ef0df1ac2535bb888e088"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" DROP CONSTRAINT "FK_08699555ad0212cc26e73325b75"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" DROP CONSTRAINT "FK_94f96115d14b407087799db2081"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" DROP CONSTRAINT "FK_9490b26a059a1d8b50e8c1b0e25"');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" DROP CONSTRAINT "UQ_4aac9035497a94deb8cdb39062e"');
        await queryRunner.query('ALTER TABLE "chamvi_docs" DROP CONSTRAINT "PK_7e25d40ab71a09ce9864bb9edda"');
        await queryRunner.query('ALTER TABLE "chamvi_docs" ADD CONSTRAINT "PK_4295fefb3d07b2b59edd03bb7e5" PRIMARY KEY ("agent", "collection", "id")');
        await queryRunner.query('ALTER TABLE "chamvi_effects" DROP CONSTRAINT "PK_01368b6901ca421676b3be52b5d"');
        await queryRunner.query('ALTER TABLE "chamvi_effects" ADD CONSTRAINT "PK_7fb2e468cabe232a81c1b268f34" PRIMARY KEY ("key")');
        await queryRunner.query('ALTER TABLE "chamvi_idempotency_keys" DROP CONSTRAINT "PK_602fae226ae5e7db4b6158c8473"');
        await queryRunner.query('ALTER TABLE "chamvi_idempotency_keys" ADD CONSTRAINT "PK_2627332526e8e1c262f044d0cb8" PRIMARY KEY ("scope", "key")');
        await queryRunner.query('ALTER TABLE "chamvi_kv" DROP CONSTRAINT "PK_99915fcddccffdc73fe9a78b3c0"');
        await queryRunner.query('ALTER TABLE "chamvi_kv" ADD CONSTRAINT "PK_d233cd69d8b336316095d52d725" PRIMARY KEY ("agent", "key")');
        await queryRunner.query('ALTER TABLE "chamvi_locks" DROP CONSTRAINT "PK_ef8ef2a3ae9f4e24736ca6b974b"');
        await queryRunner.query('ALTER TABLE "chamvi_locks" ADD CONSTRAINT "PK_836a0a3a636b596077033fda072" PRIMARY KEY ("key")');
        await queryRunner.query('ALTER TABLE "chamvi_artifacts" DROP CONSTRAINT "PK_7e208ad7eaf520738f0988b8667"');
        await queryRunner.query('ALTER TABLE "chamvi_artifacts" ADD CONSTRAINT "PK_3bb29abbf8721c61b09142bd6ce" PRIMARY KEY ("id")');
        await queryRunner.query('ALTER TABLE "chamvi_agent_revisions" DROP CONSTRAINT "PK_3ffcbf4ff17329f80927c909bd7"');
        await queryRunner.query('ALTER TABLE "chamvi_agent_revisions" ADD CONSTRAINT "PK_d355b7063fb6b3201e6d588b511" PRIMARY KEY ("agent")');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" DROP CONSTRAINT "PK_19e7c354e5ccfc709c28a0a7b2b"');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" ADD CONSTRAINT "PK_d70b087b46b044fb4d5ff1b20be" PRIMARY KEY ("id")');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" DROP CONSTRAINT "PK_f86f29cfcedf01ecbb7074fe17d"');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" ADD CONSTRAINT "PK_d0549bdaf44100277f3573561cb" PRIMARY KEY ("run_id")');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" DROP CONSTRAINT "PK_14b0601fe95040761873d7eb428"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" ADD CONSTRAINT "PK_ff451484f567e3a78070456dc53" PRIMARY KEY ("scope_id", "generation", "key")');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" DROP CONSTRAINT "PK_7af6cccadc3bcf705c4a9f8f8bf"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" ADD CONSTRAINT "PK_af30e6589f62e346f814c64cdde" PRIMARY KEY ("scope_id", "generation", "id")');
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP CONSTRAINT "PK_bfa1bbf079fc97d59a0b028c93b"');
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD CONSTRAINT "PK_a2178a599d194316d8202924a52" PRIMARY KEY ("id")');
        await queryRunner.query('DROP INDEX "IDX_d355b7063fb6b3201e6d588b51"');
        await queryRunner.query('DROP INDEX "IDX_c4156e692873ba7401c7f3c01f"');
        await queryRunner.query('DROP INDEX "IDX_61f10c9ae0957d3767ab0385b8"');
        await queryRunner.query('DROP INDEX "IDX_d70b087b46b044fb4d5ff1b20b"');
        await queryRunner.query('DROP INDEX "IDX_67c46d73ab47a75030de671b99"');
        await queryRunner.query('DROP INDEX "IDX_81d04b278cc4d8446e79f0a4d9"');
        await queryRunner.query('DROP INDEX "IDX_8cc0d748902d79a0d7085fbee9"');
        await queryRunner.query('DROP INDEX "IDX_445a24224c943565e32a837fff"');
        await queryRunner.query('DROP INDEX "IDX_d200648cfdd2ef6370c92bc668"');
        await queryRunner.query('DROP INDEX "IDX_04f7fb6103a362aea272a1acb0"');
        await queryRunner.query('DROP INDEX "IDX_ff451484f567e3a78070456dc5"');
        await queryRunner.query('DROP INDEX "IDX_af30e6589f62e346f814c64cdd"');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" ALTER COLUMN "id" DROP DEFAULT');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" DROP COLUMN "row_id"');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" DROP COLUMN "id"');
        await queryRunner.query('ALTER TABLE "chamvi_locks" DROP COLUMN "id"');
        await queryRunner.query('ALTER TABLE "chamvi_kv" DROP COLUMN "id"');
        await queryRunner.query('ALTER TABLE "chamvi_idempotency_keys" DROP COLUMN "id"');
        await queryRunner.query('ALTER TABLE "chamvi_effects" DROP COLUMN "id"');
        await queryRunner.query('ALTER TABLE "chamvi_docs" DROP COLUMN "row_id"');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" DROP COLUMN "id"');
        await queryRunner.query('ALTER TABLE "chamvi_runs" DROP COLUMN "row_id"');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" DROP COLUMN "identity_key"');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" DROP COLUMN "row_id"');
        await queryRunner.query('ALTER TABLE "chamvi_artifacts" DROP COLUMN "row_id"');
        await queryRunner.query('ALTER TABLE "chamvi_agent_revisions" DROP COLUMN "id"');
        await queryRunner.query('DROP TABLE "chamvi_connection_entries"');
        await queryRunner.query('DROP TABLE "chamvi_connections"');
        await queryRunner.query('ALTER TABLE "chamvi_conversations" ADD CONSTRAINT "FK_ef8111d766fe466a3b307675e08" FOREIGN KEY ("active_run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD CONSTRAINT "FK_f52e3d9f9a700e00b7021682252" FOREIGN KEY ("conversation_scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_runs" ADD CONSTRAINT "FK_099dba5007e83a7ad85d75ec83c" FOREIGN KEY ("parent_run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" ADD CONSTRAINT "FK_4aac9035497a94deb8cdb39062e" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID');
        await queryRunner.query('ALTER TABLE "chamvi_checkpoints" ADD CONSTRAINT "FK_a7fd19281c5f361dc8473323752" FOREIGN KEY ("conversation_scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_steps" ADD CONSTRAINT "FK_ec83b59c000dc26e022836e98b7" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_items" ADD CONSTRAINT "FK_8252e57feb07d3d5c100772ca68" FOREIGN KEY ("scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_items" ADD CONSTRAINT "FK_e3edf09ee4749bad2d7b394c830" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" ADD CONSTRAINT "FK_c2faa5ef0df1ac2535bb888e088" FOREIGN KEY ("scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_notes" ADD CONSTRAINT "FK_08699555ad0212cc26e73325b75" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" ADD CONSTRAINT "FK_94f96115d14b407087799db2081" FOREIGN KEY ("scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('ALTER TABLE "chamvi_conversation_operations" ADD CONSTRAINT "FK_9490b26a059a1d8b50e8c1b0e25" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION');
        await queryRunner.query('DROP FUNCTION chamvi_uuid_v7()');
    }
}
