/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationItemBytes1794873600000 implements MigrationInterface {
    name = 'ConversationItemBytes1794873600000';

    public async up(queryRunner: QueryRunner): Promise<void> {
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
    }
}
