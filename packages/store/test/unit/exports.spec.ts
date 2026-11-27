/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import type * as kit from '@chamvi/core-kit';
import * as store from '@chamvi/store';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

describe('public api', () => {
    it('exports no runtime value: the ports are types', () => {
        expect(Object.keys(store)).toEqual([]);
    });

    it('exports the ports of checkpoints, effects, artifacts and state over the generic entity port', () => {
        expectTypeOf<store.ICheckpointRepository>().toExtend<store.IEntityRepository<kit.CheckpointRecord>>();
        expectTypeOf<store.IEffectRepository>().toExtend<store.IEntityRepository<kit.EffectRecord>>();
        expectTypeOf<store.IAgentRevisionRepository>().toExtend<store.IEntityRepository<kit.AgentRevisionRecord>>();
        expectTypeOf<store.IArtifactRepository>().toExtend<store.IEntityRepository<kit.ArtifactRecord>>();
        expectTypeOf<store.IArtifactRepository['readData']>().toEqualTypeOf<(id: string) => Promise<Uint8Array | null>>();
        expectTypeOf<store.IStateRepository>().toExtend<store.IEntityRepository<kit.StateEntry>>();
        expectTypeOf<store.IStateDocumentRepository>().toExtend<store.IEntityRepository<kit.StateDocument>>();
        expectTypeOf<store.IStateDocumentRepository['findContaining']>().returns.toEqualTypeOf<
            Promise<store.EntityFindManyResult<kit.StateDocument>>
        >();
    });

    it('exports the ports of locks and idempotency keys over the generic entity port', () => {
        expectTypeOf<store.ILockRepository>().toExtend<store.IEntityRepository<kit.Lock>>();
        expectTypeOf<store.ILockRepository['removeExpiredBy']>().toEqualTypeOf<(time: Date) => Promise<number>>();
        expectTypeOf<store.ILockRepository['nextToken']>().toEqualTypeOf<() => Promise<number>>();
        expectTypeOf<store.IIdempotencyRepository>().toExtend<store.IEntityRepository<kit.IdempotencyKey>>();
        expectTypeOf<store.IIdempotencyRepository['removeExpiredBy']>().toEqualTypeOf<(time: Date) => Promise<number>>();
    });

    it('exports the port of limit uses over the generic entity port', () => {
        expectTypeOf<store.ILimitRepository>().toExtend<store.IEntityRepository<kit.LimitUse>>();
        expectTypeOf<store.ILimitRepository['sumWeight']>().toEqualTypeOf<(scope: string, since: Date) => Promise<number>>();
        expectTypeOf<store.ILimitRepository['removeCreatedBefore']>().toEqualTypeOf<(time: Date) => Promise<number>>();
    });

    it('exports the batched operations and the where type of the generic port', () => {
        type Row = { id: string; n: number };

        expectTypeOf<store.EntityWhere<Row>>().toEqualTypeOf<{ id?: string | string[] | null; n?: number | number[] | null }>();
        expectTypeOf<store.IEntityRepository<Row>['upsertMany']>().toEqualTypeOf<(entities: Row[]) => Promise<Row[]>>();
        expectTypeOf<store.IEntityRepository<Row>['removeManyBy']>().toEqualTypeOf<(where: store.EntityWhere<Row>) => Promise<number>>();
        expectTypeOf<store.IEntityRepository<Row>['findManyBy']>().toEqualTypeOf<(where: store.EntityWhere<Row>) => Promise<Row[]>>();
    });

    it('exports the connection port with its child repositories and the fence read', () => {
        expectTypeOf<store.IConnectionRepository>().toExtend<store.IEntityRepository<kit.ConnectionRecord>>();
        expectTypeOf<store.IConnectionRepository['entries']>().toEqualTypeOf<store.IConnectionEntryRepository>();
        expectTypeOf<store.IConnectionRepository['secrets']>().toEqualTypeOf<store.IConnectionSecretRepository>();
        expectTypeOf<store.IConnectionEntryRepository>().toExtend<store.IEntityRepository<kit.ConnectionEntryRecord>>();
        expectTypeOf<store.IConnectionSecretRepository>().toExtend<store.IEntityRepository<kit.ConnectionSecretRecord>>();
        expectTypeOf<store.IConnectionRepository['findFence']>().toEqualTypeOf<(name: string) => Promise<kit.Lock | null>>();
    });

    it('exports the conversation port with its child repositories and no conversation-specific method', () => {
        expectTypeOf<store.IConversationRepository>().toExtend<store.IEntityRepository<kit.ConversationRecord>>();
        expectTypeOf<store.IConversationRepository['items']>().toEqualTypeOf<store.IConversationItemRepository>();
        expectTypeOf<store.IConversationRepository['notes']>().toEqualTypeOf<store.IConversationNoteRepository>();
        expectTypeOf<store.IConversationRepository['operations']>().toEqualTypeOf<store.IConversationOperationRepository>();
        expectTypeOf<store.IConversationItemRepository>().toExtend<store.IEntityRepository<kit.ConversationItemRecord>>();
        expectTypeOf<store.IConversationNoteRepository>().toExtend<store.IEntityRepository<kit.ConversationNoteRecord>>();
        expectTypeOf<store.IConversationOperationRepository>().toExtend<store.IEntityRepository<kit.ConversationOperationRecord>>();
        // the port adds the three children only
        expectTypeOf<Exclude<keyof store.IConversationRepository, keyof store.IEntityRepository<kit.ConversationRecord>>>()
            .toEqualTypeOf<'items' | 'notes' | 'operations'>();
    });

    it('names no database driver in its sources', () => {
        const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
            .filter((file) => file.endsWith('.ts'));

        expect(files.length).toBeGreaterThan(0);

        for (const file of files) {
            const content = readFileSync(`${SRC}${file}`, 'utf8');

            for (const word of ['typeorm', 'JoinColumn', 'EntityManager', 'QueryBuilder']) {
                expect(content.toLowerCase(), `${file} names ${word}`).not.toContain(word.toLowerCase());
            }
        }
    });
});
