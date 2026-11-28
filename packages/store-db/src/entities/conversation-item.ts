/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { ConversationItem } from '@chamvi/core-kit';
import { TableName } from './constants.ts';
import { ConversationEntity } from './conversation.ts';
import { RunEntity } from './run.ts';

@Index(['scopeId', 'generation', 'key'], { unique: true })
@Index(['scopeId', 'generation', 'sequence'])
@Index(['runId'])
@Entity({ name: TableName.CONVERSATION_ITEMS })
export class ConversationItemEntity {
    @PrimaryColumn({ type: 'uuid' })
    id!: string;

    /** The order items were stored in, assigned by the database; an upsert keeps a replaced row's. */
    @Column({
        type: 'bigint',
        generated: 'increment',
        insert: false,
        update: false,
    })
    sequence!: string;

    @Column({
        name: 'scope_id',
        type: 'uuid',
    })
    scopeId!: string;

    @Column({ type: 'integer' })
    generation!: number;

    @Column({
        name: 'key',
        type: 'text',
        collation: 'C',
    })
    key!: string;

    @Column({
        name: 'run_id',
        type: 'uuid',
    })
    runId!: string;

    @Column({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt!: Date;

    @Column({ type: 'text' })
    role!: ConversationItem['role'];

    @Column({ type: 'text' })
    text!: string;

    /** The UTF-8 byte length of `text`, set by the conversation service. */
    @Column({ type: 'integer' })
    bytes!: number;

    @Column({ type: 'text' })
    status!: ConversationItem['status'];

    @Column({
        name: 'effect_key',
        type: 'text',
        nullable: true,
    })
    // Journaled before the receipt exists; uncertain sends may never produce one.
    effectKey!: string | null;

    @Column({
        name: 'target_channel',
        type: 'text',
        nullable: true,
    })
    targetChannel!: string | null;

    @Column({
        name: 'target_address',
        type: 'text',
        nullable: true,
    })
    targetAddress!: string | null;

    @ManyToOne(() => ConversationEntity, {
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
    })
    @JoinColumn({ name: 'scope_id', referencedColumnName: 'id' })
    conversation?: Relation<ConversationEntity>;

    @ManyToOne(() => RunEntity, {
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
    })
    @JoinColumn({ name: 'run_id', referencedColumnName: 'id' })
    run?: Relation<RunEntity>;
}
