/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1793923200000 implements MigrationInterface {
    name = 'Init1793923200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chamvi_agent_revisions" (
                "id" uuid NOT NULL,
                "agent" character varying(64) COLLATE "C" NOT NULL,
                "hash" character varying(128) NOT NULL,
                "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_3ffcbf4ff17329f80927c909bd7" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_d355b7063fb6b3201e6d588b51" ON "chamvi_agent_revisions" ("agent")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_artifacts" (
                "id" uuid NOT NULL,
                "run_id" uuid NOT NULL,
                "agent" character varying(64) NOT NULL,
                "media_type" text NOT NULL,
                "filename" text,
                "size" integer NOT NULL,
                "data" bytea NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_c4156e692873ba7401c7f3c01fd" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ff9ed484c27b76465c2b54f7cf" ON "chamvi_artifacts" ("run_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_conversations" (
                "id" uuid NOT NULL,
                "identity_key" character varying(64) COLLATE "C" NOT NULL,
                "agent" text COLLATE "C" NOT NULL,
                "channel" text COLLATE "C" NOT NULL,
                "account" text COLLATE "C" NOT NULL,
                "chat" text COLLATE "C" NOT NULL,
                "audience" text COLLATE "C" NOT NULL,
                "generation" integer NOT NULL,
                "active_run_id" uuid,
                "snapshot_messages" jsonb,
                "snapshot_item_ids" text array,
                "snapshot_note_keys" text array,
                "snapshot_created_at" TIMESTAMP WITH TIME ZONE,
                "snapshot_omitted" integer,
                CONSTRAINT "PK_d70b087b46b044fb4d5ff1b20be" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_61f10c9ae0957d3767ab0385b8" ON "chamvi_conversations" ("identity_key")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ef8111d766fe466a3b307675e0" ON "chamvi_conversations" ("active_run_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_runs" (
                "id" uuid NOT NULL,
                "agent" character varying(64) NOT NULL,
                "status" character varying(16) NOT NULL,
                "trigger" jsonb NOT NULL,
                "concurrency_key" character varying(255),
                "thread" character varying(255),
                "output" jsonb,
                "error" jsonb,
                "usage" jsonb NOT NULL,
                "subtree_usage" jsonb,
                "parent_run_id" uuid,
                "waiting" jsonb,
                "taint" jsonb,
                "claim_owner" character varying(255),
                "claim_expires_at" TIMESTAMP WITH TIME ZONE,
                "cancel_requested" boolean,
                "conversation_scope_id" uuid,
                "conversation_generation" integer,
                "conversation_agent" text,
                "conversation_channel" text,
                "conversation_account" text,
                "conversation_chat" text,
                "conversation_audience" text,
                "conversation_text" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "started_at" TIMESTAMP WITH TIME ZONE,
                "finished_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_67c46d73ab47a75030de671b99c" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_099dba5007e83a7ad85d75ec83" ON "chamvi_runs" ("parent_run_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_f52e3d9f9a700e00b702168225" ON "chamvi_runs" ("conversation_scope_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ff7160783f3efb05a7092227e0" ON "chamvi_runs" ("status", "created_at", "id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_d45da2a6da9f1ffa9a258362e5" ON "chamvi_runs" ("agent", "status", "concurrency_key")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_checkpoints" (
                "id" uuid NOT NULL,
                "run_id" uuid NOT NULL,
                "conversation_scope_id" uuid,
                "conversation_generation" integer,
                "step_index" integer NOT NULL,
                "messages" jsonb NOT NULL,
                "finish_reason" character varying(64),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "REL_4aac9035497a94deb8cdb39062" UNIQUE ("run_id"),
                CONSTRAINT "PK_f86f29cfcedf01ecbb7074fe17d" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a7fd19281c5f361dc847332375" ON "chamvi_checkpoints" ("conversation_scope_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_connections" (
                "id" uuid NOT NULL,
                "name" character varying(64) COLLATE "C" NOT NULL,
                "type" character varying(64) NOT NULL,
                "key_id" character varying(64) NOT NULL,
                "wrapped_key" bytea NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_dca348520cf0cebbe56b461d421" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e7686bb29a31182711655bf5bb" ON "chamvi_connections" ("name")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_connection_entries" (
                "id" uuid NOT NULL,
                "connection_name" character varying(64) COLLATE "C" NOT NULL,
                "key" character varying(255) COLLATE "C" NOT NULL,
                "value" bytea NOT NULL,
                CONSTRAINT "PK_2691559008f1b2d24d6d85d49d8" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_6617c764ab669582a4f80c343e" ON "chamvi_connection_entries" ("connection_name", "key")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_docs" (
                "id" uuid NOT NULL,
                "agent" character varying(64) NOT NULL,
                "collection" character varying(255) NOT NULL,
                "document_id" character varying(255) NOT NULL,
                "doc" jsonb NOT NULL,
                CONSTRAINT "PK_221d29889f2064fdb34a9fb8b28" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_f2205662f09600f622430012d4" ON "chamvi_docs" ("agent", "collection", "document_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_chamvi_docs_doc_gin" ON "chamvi_docs" USING gin ("doc")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_effects" (
                "id" uuid NOT NULL,
                "key" character varying(512) NOT NULL,
                "result" jsonb,
                CONSTRAINT "PK_01368b6901ca421676b3be52b5d" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_8cc0d748902d79a0d7085fbee9" ON "chamvi_effects" ("key")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_idempotency_keys" (
                "id" uuid NOT NULL,
                "scope" character varying(1024) NOT NULL,
                "key" character varying(512) NOT NULL,
                "run_id" uuid NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_602fae226ae5e7db4b6158c8473" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4a19fe98858eeb058da8a23da5" ON "chamvi_idempotency_keys" ("expires_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_445a24224c943565e32a837fff" ON "chamvi_idempotency_keys" ("scope", "key")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_kv" (
                "id" uuid NOT NULL,
                "agent" character varying(64) NOT NULL,
                "key" character varying(512) COLLATE "C" NOT NULL,
                "value" jsonb NOT NULL,
                CONSTRAINT "PK_99915fcddccffdc73fe9a78b3c0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_d200648cfdd2ef6370c92bc668" ON "chamvi_kv" ("agent", "key")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_locks" (
                "id" uuid NOT NULL,
                "key" character varying(512) NOT NULL,
                "owner" character varying(255) NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_ef8ef2a3ae9f4e24736ca6b974b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c56298596772b49f21f447b0c1" ON "chamvi_locks" ("expires_at")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_04f7fb6103a362aea272a1acb0" ON "chamvi_locks" ("key")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_steps" (
                "seq" BIGSERIAL NOT NULL,
                "run_id" uuid NOT NULL,
                "step_index" integer NOT NULL,
                "kind" character varying(8) NOT NULL,
                "name" character varying(255),
                "input" jsonb,
                "output" jsonb,
                "error" jsonb,
                "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "finished_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_72353942e42d70f6532fa654d3d" PRIMARY KEY ("seq")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_520ee8478aecbdd2416de5c891" ON "chamvi_steps" ("run_id", "step_index")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_conversation_items" (
                "seq" BIGSERIAL NOT NULL,
                "scope_id" uuid NOT NULL,
                "generation" integer NOT NULL,
                "id" text COLLATE "C" NOT NULL,
                "run_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "role" text NOT NULL,
                "text" text NOT NULL,
                "status" text NOT NULL,
                "effect_key" text,
                "target_channel" text,
                "target_address" text,
                CONSTRAINT "PK_f777143245b3b360dfbe02a1bc1" PRIMARY KEY ("seq")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e3edf09ee4749bad2d7b394c83" ON "chamvi_conversation_items" ("run_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_d53928fda61d11e44f785eb2a6" ON "chamvi_conversation_items" ("scope_id", "generation", "created_at", "seq")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e33a156ff38559b5139e6a73ae" ON "chamvi_conversation_items" ("scope_id", "generation", "id")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_conversation_notes" (
                "id" uuid NOT NULL,
                "scope_id" uuid NOT NULL,
                "generation" integer NOT NULL,
                "key" text COLLATE "C" NOT NULL,
                "text" text NOT NULL,
                "run_id" uuid NOT NULL,
                "tool_call_id" text NOT NULL,
                "step_index" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_14b0601fe95040761873d7eb428" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_ff451484f567e3a78070456dc5" ON "chamvi_conversation_notes" ("scope_id", "generation", "key")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_08699555ad0212cc26e73325b7" ON "chamvi_conversation_notes" ("run_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_cce05651783379a393713278e1" ON "chamvi_conversation_notes" ("expires_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "chamvi_conversation_operations" (
                "id" uuid NOT NULL,
                "scope_id" uuid NOT NULL,
                "generation" integer NOT NULL,
                "operation_id" text COLLATE "C" NOT NULL,
                "run_id" uuid NOT NULL,
                "input_hash" text NOT NULL,
                "kind" text NOT NULL,
                "key" text COLLATE "C" NOT NULL,
                "removed" boolean,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_6725f1561ff33b191f8acf1b41b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_646a741ca8d168873f635fdfad" ON "chamvi_conversation_operations" ("scope_id", "generation", "operation_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9490b26a059a1d8b50e8c1b0e2" ON "chamvi_conversation_operations" ("run_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_84e0f39240559b48a4766bcb80" ON "chamvi_conversation_operations" ("scope_id", "created_at", "operation_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversations"
            ADD CONSTRAINT "FK_ef8111d766fe466a3b307675e08" FOREIGN KEY ("active_run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_runs"
            ADD CONSTRAINT "FK_f52e3d9f9a700e00b7021682252" FOREIGN KEY ("conversation_scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_runs"
            ADD CONSTRAINT "FK_099dba5007e83a7ad85d75ec83c" FOREIGN KEY ("parent_run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_checkpoints"
            ADD CONSTRAINT "FK_4aac9035497a94deb8cdb39062e" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_checkpoints"
            ADD CONSTRAINT "FK_a7fd19281c5f361dc8473323752" FOREIGN KEY ("conversation_scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_connection_entries"
            ADD CONSTRAINT "FK_5f7fb05d2504ede0bd561b737ca" FOREIGN KEY ("connection_name") REFERENCES "chamvi_connections"("name") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_steps"
            ADD CONSTRAINT "FK_ec83b59c000dc26e022836e98b7" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items"
            ADD CONSTRAINT "FK_8252e57feb07d3d5c100772ca68" FOREIGN KEY ("scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items"
            ADD CONSTRAINT "FK_e3edf09ee4749bad2d7b394c830" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_notes"
            ADD CONSTRAINT "FK_c2faa5ef0df1ac2535bb888e088" FOREIGN KEY ("scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_notes"
            ADD CONSTRAINT "FK_08699555ad0212cc26e73325b75" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_operations"
            ADD CONSTRAINT "FK_94f96115d14b407087799db2081" FOREIGN KEY ("scope_id") REFERENCES "chamvi_conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_operations"
            ADD CONSTRAINT "FK_9490b26a059a1d8b50e8c1b0e25" FOREIGN KEY ("run_id") REFERENCES "chamvi_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_operations" DROP CONSTRAINT "FK_9490b26a059a1d8b50e8c1b0e25"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_operations" DROP CONSTRAINT "FK_94f96115d14b407087799db2081"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_notes" DROP CONSTRAINT "FK_08699555ad0212cc26e73325b75"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_notes" DROP CONSTRAINT "FK_c2faa5ef0df1ac2535bb888e088"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items" DROP CONSTRAINT "FK_e3edf09ee4749bad2d7b394c830"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversation_items" DROP CONSTRAINT "FK_8252e57feb07d3d5c100772ca68"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_steps" DROP CONSTRAINT "FK_ec83b59c000dc26e022836e98b7"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_connection_entries" DROP CONSTRAINT "FK_5f7fb05d2504ede0bd561b737ca"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_checkpoints" DROP CONSTRAINT "FK_a7fd19281c5f361dc8473323752"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_checkpoints" DROP CONSTRAINT "FK_4aac9035497a94deb8cdb39062e"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_runs" DROP CONSTRAINT "FK_099dba5007e83a7ad85d75ec83c"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_runs" DROP CONSTRAINT "FK_f52e3d9f9a700e00b7021682252"
        `);
        await queryRunner.query(`
            ALTER TABLE "chamvi_conversations" DROP CONSTRAINT "FK_ef8111d766fe466a3b307675e08"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_84e0f39240559b48a4766bcb80"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_9490b26a059a1d8b50e8c1b0e2"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_646a741ca8d168873f635fdfad"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_conversation_operations"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_cce05651783379a393713278e1"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_08699555ad0212cc26e73325b7"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_ff451484f567e3a78070456dc5"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_conversation_notes"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_e33a156ff38559b5139e6a73ae"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_d53928fda61d11e44f785eb2a6"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_e3edf09ee4749bad2d7b394c83"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_conversation_items"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_520ee8478aecbdd2416de5c891"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_steps"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_04f7fb6103a362aea272a1acb0"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_c56298596772b49f21f447b0c1"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_locks"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_d200648cfdd2ef6370c92bc668"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_kv"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_445a24224c943565e32a837fff"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_4a19fe98858eeb058da8a23da5"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_idempotency_keys"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_8cc0d748902d79a0d7085fbee9"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_effects"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_chamvi_docs_doc_gin"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_f2205662f09600f622430012d4"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_docs"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_6617c764ab669582a4f80c343e"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_connection_entries"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_e7686bb29a31182711655bf5bb"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_connections"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_a7fd19281c5f361dc847332375"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_checkpoints"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_d45da2a6da9f1ffa9a258362e5"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_ff7160783f3efb05a7092227e0"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_f52e3d9f9a700e00b702168225"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_099dba5007e83a7ad85d75ec83"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_runs"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_ef8111d766fe466a3b307675e0"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_61f10c9ae0957d3767ab0385b8"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_conversations"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_ff9ed484c27b76465c2b54f7cf"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_artifacts"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_d355b7063fb6b3201e6d588b51"
        `);
        await queryRunner.query(`
            DROP TABLE "chamvi_agent_revisions"
        `);
    }
}
