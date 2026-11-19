/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ModelMessage } from 'ai';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import * as store from '@chamvi/store';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

describe('public api', () => {
    it('exports exactly the errors, the codes, the run status, the step and conversation item order fields and the read normalizers', () => {
        expect(Object.keys(store).sort()).toEqual([
            'CONVERSATION_ITEM_STORED_ORDER',
            'EntityConflictError',
            'EntityDeadlockError',
            'EntityInvalidError',
            'EntityNotFoundError',
            'EntityQueryError',
            'EntityRelationError',
            'RunStatus',
            'STEP_STORED_ORDER',
            'StoreErrorCode',
            'normalizeEnvelope',
            'normalizeWaitPoint',
        ]);
    });

    it('exports the RunStatus enum', () => {
        expect(store.RunStatus.QUEUED).toBe('queued');
        expectTypeOf<store.RunStatusLiteral>().toEqualTypeOf<
            'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
        >();
    });

    it('exports the stored record types', () => {
        expectTypeOf<store.Run['status']>().toEqualTypeOf<store.RunStatusLiteral>();
        expectTypeOf<store.Run['trigger']>().toEqualTypeOf<store.TriggerEnvelope>();
        expectTypeOf<store.Run['usage']>().toEqualTypeOf<store.Usage>();
        expectTypeOf<store.Run['taint']>().toEqualTypeOf<store.RunTaint | undefined>();
        expectTypeOf<store.Run['waiting']>().toEqualTypeOf<store.WaitPoint | undefined>();
        expectTypeOf<store.Run['conversation']>().toEqualTypeOf<store.ConversationBinding | undefined>();
        expectTypeOf<store.WaitPoint>().toEqualTypeOf<store.ApprovalWaitPoint | store.DispatchWaitPoint | store.RemoteWaitPoint>();
        expectTypeOf<NonNullable<store.RemoteWaitPoint['remote']>['approval']>().toEqualTypeOf<store.RemoteApproval | undefined>();
        expectTypeOf<store.ApprovalWaitPoint['options']>().toEqualTypeOf<store.ApprovalOption[] | undefined>();
        expectTypeOf<store.TriggerEnvelope['invoker']>().toEqualTypeOf<store.Invoker | undefined>();
        expectTypeOf<store.TriggerEnvelope['parent']>().toEqualTypeOf<store.TriggerParent | undefined>();
        expectTypeOf<store.TriggerEnvelope['attachments']>().toEqualTypeOf<store.Artifact[] | undefined>();
        expectTypeOf<store.TriggerParent>().toEqualTypeOf<store.DispatchParent | store.PeerParent>();
        expectTypeOf<store.DispatchParent['source']>().toEqualTypeOf<store.TriggerSource | undefined>();
        expectTypeOf<store.Step['kind']>().toEqualTypeOf<'llm' | 'tool' | 'wait'>();
        expectTypeOf<store.Checkpoint['messages']>().toEqualTypeOf<ModelMessage[]>();
        expectTypeOf<store.AgentRevision>().toEqualTypeOf<{
            agent: string;
            hash: string;
            changedAt: Date;
        }>();
        expectTypeOf<store.Connection['wrappedKey']>().toEqualTypeOf<Uint8Array>();
        expectTypeOf<store.ConversationBinding['scope']>().toEqualTypeOf<store.ConversationScope>();
        expectTypeOf<store.ConversationScope['identity']>().toEqualTypeOf<store.ConversationIdentity>();
        expectTypeOf<store.ConversationItem['role']>().toEqualTypeOf<'user' | 'assistant'>();
        expectTypeOf<store.ConversationNote['source']>().toEqualTypeOf<store.ConversationNoteSource>();
        expectTypeOf<store.ConversationNoteOperation['source']>().toEqualTypeOf<store.ConversationNoteSource>();
        expectTypeOf<store.ConversationSnapshot['messages']>().toEqualTypeOf<ModelMessage[]>();
        expectTypeOf<store.CheckpointRecord>().toEqualTypeOf<store.Checkpoint & { id: string }>();
        expectTypeOf<store.AgentRevisionRecord>().toEqualTypeOf<store.AgentRevision & { id: string }>();
        expectTypeOf<store.EffectRecord>().toEqualTypeOf<{
            id: string;
            key: string;
            result: unknown
        }>();
        expectTypeOf<store.ArtifactRecord>().toEqualTypeOf<store.Artifact & { key?: string; data?: Uint8Array }>();
        expectTypeOf<keyof store.Artifact>().toEqualTypeOf<'id' | 'runId' | 'agent' | 'mediaType' | 'filename' | 'size' | 'createdAt'>();
        expectTypeOf<store.StateEntry>().toEqualTypeOf<{
            id: string;
            agent: string;
            key: string;
            value: unknown
        }>();
        expectTypeOf<store.StateDocument>().toEqualTypeOf<{
            id: string;
            agent: string;
            collection: string;
            documentId: string;
            doc: unknown;
        }>();
    });

    it('exports the ports of checkpoints, effects, artifacts and state over the generic entity port', () => {
        expectTypeOf<store.ICheckpointRepository>().toExtend<store.IEntityRepository<store.CheckpointRecord>>();
        expectTypeOf<store.IEffectRepository>().toExtend<store.IEntityRepository<store.EffectRecord>>();
        expectTypeOf<store.IAgentRevisionRepository>().toExtend<store.IEntityRepository<store.AgentRevisionRecord>>();
        expectTypeOf<store.IArtifactRepository>().toExtend<store.IEntityRepository<store.ArtifactRecord>>();
        expectTypeOf<store.IArtifactRepository['readData']>().toEqualTypeOf<(id: string) => Promise<Uint8Array | null>>();
        expectTypeOf<store.IStateRepository>().toExtend<store.IEntityRepository<store.StateEntry>>();
        expectTypeOf<store.IStateDocumentRepository>().toExtend<store.IEntityRepository<store.StateDocument>>();
        expectTypeOf<store.IStateDocumentRepository['findContaining']>().returns.toEqualTypeOf<
            Promise<store.EntityFindManyResult<store.StateDocument>>
        >();
    });

    it('exports the ports of locks and idempotency keys over the generic entity port', () => {
        expectTypeOf<store.Lock>().toEqualTypeOf<{
            id: string;
            key: string;
            owner: string;
            expiresAt: Date;
        }>();
        expectTypeOf<store.IdempotencyKey>().toEqualTypeOf<{
            id: string;
            scope: string;
            key: string;
            runId: string;
            expiresAt: Date;
        }>();
        expectTypeOf<store.ILockRepository>().toExtend<store.IEntityRepository<store.Lock>>();
        expectTypeOf<store.ILockRepository['removeExpiredBy']>().toEqualTypeOf<(time: Date) => Promise<number>>();
        expectTypeOf<store.IIdempotencyRepository>().toExtend<store.IEntityRepository<store.IdempotencyKey>>();
        expectTypeOf<store.IIdempotencyRepository['removeExpiredBy']>().toEqualTypeOf<(time: Date) => Promise<number>>();
    });

    it('exports the batched operations and the where type of the generic port', () => {
        type Row = { id: string; n: number };

        expectTypeOf<store.EntityWhere<Row>>().toEqualTypeOf<{ id?: string | string[] | null; n?: number | number[] | null }>();
        expectTypeOf<store.IEntityRepository<Row>['upsertMany']>().toEqualTypeOf<(entities: Row[]) => Promise<Row[]>>();
        expectTypeOf<store.IEntityRepository<Row>['removeManyBy']>().toEqualTypeOf<(where: store.EntityWhere<Row>) => Promise<number>>();
        expectTypeOf<store.IEntityRepository<Row>['findManyBy']>().toEqualTypeOf<(where: store.EntityWhere<Row>) => Promise<Row[]>>();
    });

    it('exports the connection port with its child repositories and the fence read', () => {
        expectTypeOf<store.Connection['id']>().toEqualTypeOf<string>();
        expectTypeOf<store.ConnectionInput>().toEqualTypeOf<Omit<store.Connection, 'id'>>();
        expectTypeOf<store.ConnectionRecord>().toEqualTypeOf<store.Connection & {
            settings: Record<string, unknown>;
            configRevision: number;
        }>();
        expectTypeOf<store.ConnectionEntryRecord>().toEqualTypeOf<{
            id: string;
            connectionId: string;
            key: string;
            value: Uint8Array;
        }>();
        expectTypeOf<store.ConnectionSecretRecord>().toEqualTypeOf<{
            id: string;
            connectionId: string;
            name: string;
            value: Uint8Array;
        }>();
        expectTypeOf<store.IConnectionRepository>().toExtend<store.IEntityRepository<store.ConnectionRecord>>();
        expectTypeOf<store.IConnectionRepository['entries']>().toEqualTypeOf<store.IConnectionEntryRepository>();
        expectTypeOf<store.IConnectionRepository['secrets']>().toEqualTypeOf<store.IConnectionSecretRepository>();
        expectTypeOf<store.IConnectionEntryRepository>().toExtend<store.IEntityRepository<store.ConnectionEntryRecord>>();
        expectTypeOf<store.IConnectionSecretRepository>().toExtend<store.IEntityRepository<store.ConnectionSecretRecord>>();
        expectTypeOf<store.IConnectionRepository['findFence']>().toEqualTypeOf<(name: string) => Promise<store.Lock | null>>();
    });

    it('exports the conversation port with its child repositories and no conversation-specific method', () => {
        expect(store.CONVERSATION_ITEM_STORED_ORDER).toBe('id');
        expectTypeOf<store.ConversationRecord>().toEqualTypeOf<{
            id: string;
            key: string;
            identity: store.ConversationIdentity;
            generation: number;
            activeRunId?: string;
            snapshot?: store.ConversationRecordSnapshot;
        }>();
        expectTypeOf<store.ConversationRecordSnapshot>()
            .toEqualTypeOf<Pick<store.ConversationSnapshot, 'messages' | 'itemIds' | 'noteKeys' | 'createdAt' | 'omitted'>>();
        expectTypeOf<store.ConversationItemRecord>().toEqualTypeOf<Omit<store.ConversationItem, 'id'> & {
            id: number;
            key: string;
            scopeId: string;
            generation: number;
            bytes: number;
        }>();
        expectTypeOf<store.ConversationNoteRecord>().toEqualTypeOf<store.ConversationNote & {
            id: string;
            scopeId: string;
            generation: number
        }>();
        expectTypeOf<store.ConversationOperationRecord['kind']>().toEqualTypeOf<'set' | 'remove'>();
        expectTypeOf<store.IConversationRepository>().toExtend<store.IEntityRepository<store.ConversationRecord>>();
        expectTypeOf<store.IConversationRepository['items']>().toEqualTypeOf<store.IConversationItemRepository>();
        expectTypeOf<store.IConversationRepository['notes']>().toEqualTypeOf<store.IConversationNoteRepository>();
        expectTypeOf<store.IConversationRepository['operations']>().toEqualTypeOf<store.IConversationOperationRepository>();
        expectTypeOf<store.IConversationItemRepository>().toExtend<store.IEntityRepository<store.ConversationItemRecord>>();
        expectTypeOf<store.IConversationNoteRepository>().toExtend<store.IEntityRepository<store.ConversationNoteRecord>>();
        expectTypeOf<store.IConversationOperationRepository>().toExtend<store.IEntityRepository<store.ConversationOperationRecord>>();
        // the port adds the three children only
        expectTypeOf<Exclude<keyof store.IConversationRepository, keyof store.IEntityRepository<store.ConversationRecord>>>()
            .toEqualTypeOf<'items' | 'notes' | 'operations'>();
    });

    it('reads legacy stored shapes back in the current shape', () => {
        expect(store.normalizeEnvelope({ source: 'cron', thread: 't' })).toEqual({ channel: 'cron', address: 't' });
        expect(store.normalizeWaitPoint({ kind: 'approval', approvalId: '1:c:0' })).toEqual({
            kind: 'approval',
            approvalId: '1:c:0',
            id: '1:c:0',
        });
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
