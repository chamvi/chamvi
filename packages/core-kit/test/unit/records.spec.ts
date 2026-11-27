/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PermissionAuthorization, PermissionBinding, PermissionIdentity } from '@chamvi/access';
import type { ModelMessage } from 'ai';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import * as kit from '@chamvi/core-kit';

describe('domain records', () => {
    it('keeps the run status values', () => {
        expect(Object.values(kit.RunStatus)).toEqual([
            'queued',
            'running',
            'waiting',
            'completed',
            'failed',
            'cancelled',
            'interrupted',
        ]);
        expectTypeOf<kit.RunStatusLiteral>().toEqualTypeOf<
            'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
        >();
    });

    it('keeps the stored order fields', () => {
        expect(kit.STEP_STORED_ORDER).toBe('id');
        expect(kit.CONVERSATION_ITEM_STORED_ORDER).toBe('id');
    });

    it('keeps the agent revision records', () => {
        expectTypeOf<kit.AgentRevision>().toEqualTypeOf<{
            agent: string;
            hash: string;
            changedAt: Date;
        }>();
        expectTypeOf<kit.AgentRevisionRecord>().toEqualTypeOf<kit.AgentRevision & { id: string }>();
    });

    it('keeps the approval option', () => {
        expectTypeOf<kit.ApprovalOption>().toEqualTypeOf<{
            id: string;
            label: string;
            detail?: string;
            artifacts?: string[];
        }>();
    });

    it('keeps the artifact records', () => {
        expectTypeOf<kit.Artifact>().toEqualTypeOf<{
            id: string;
            runId: string;
            agent: string;
            mediaType: string;
            filename?: string;
            size: number;
            createdAt: Date;
        }>();
        expectTypeOf<kit.ArtifactRecord>().toEqualTypeOf<kit.Artifact & { key?: string; data?: Uint8Array }>();
    });

    it('keeps the checkpoint records', () => {
        expectTypeOf<kit.Checkpoint>().toEqualTypeOf<{
            runId: string;
            stepIndex: number;
            messages: ModelMessage[];
            finishReason?: string;
            conversation?: {
                scopeId: string;
                generation: number;
            };
            createdAt: Date;
        }>();
        expectTypeOf<kit.CheckpointRecord>().toEqualTypeOf<kit.Checkpoint & { id: string }>();
    });

    it('keeps the connection records', () => {
        expectTypeOf<kit.Connection>().toEqualTypeOf<{
            id: string;
            name: string;
            type: string;
            keyId: string;
            wrappedKey: Uint8Array;
            createdAt: Date;
            updatedAt: Date;
        }>();
        expectTypeOf<kit.ConnectionInput>().toEqualTypeOf<Omit<kit.Connection, 'id'>>();
        expectTypeOf<kit.ConnectionRecord>().toEqualTypeOf<kit.Connection & {
            settings: Record<string, unknown>;
            configRevision: number;
        }>();
        expectTypeOf<kit.ConnectionEntryRecord>().toEqualTypeOf<{
            id: string;
            connectionId: string;
            key: string;
            value: Uint8Array;
        }>();
        expectTypeOf<kit.ConnectionSecretRecord>().toEqualTypeOf<{
            id: string;
            connectionId: string;
            name: string;
            value: Uint8Array;
        }>();
    });

    it('keeps the conversation records', () => {
        expectTypeOf<kit.ConversationIdentity>().toEqualTypeOf<{
            agent: string;
            channel: string;
            account: string;
            chat: string;
            audience: string;
        }>();
        expectTypeOf<kit.ConversationScope>().toEqualTypeOf<{
            id: string;
            generation: number;
            identity: kit.ConversationIdentity;
        }>();
        expectTypeOf<kit.ConversationBinding>().toEqualTypeOf<{
            scope: kit.ConversationScope;
            text: string;
        }>();
        expectTypeOf<kit.ConversationItem>().toEqualTypeOf<{
            id: string;
            role: 'user' | 'assistant';
            text: string;
            runId: string;
            createdAt: Date;
            status: 'pending' | 'sent' | 'unknown';
            effectKey?: string;
            target?: { channel: string; address: string };
        }>();
        expectTypeOf<kit.ConversationNoteSource>().toEqualTypeOf<{
            runId: string;
            toolCallId: string;
            stepIndex: number;
        }>();
        expectTypeOf<kit.ConversationNote>().toEqualTypeOf<{
            key: string;
            text: string;
            createdAt: Date;
            updatedAt: Date;
            expiresAt?: Date;
            source: kit.ConversationNoteSource;
        }>();
        expectTypeOf<kit.ConversationNoteOperation>().toEqualTypeOf<{
            id: string;
            inputHash: string;
            source: kit.ConversationNoteSource;
            kind: 'set';
            key: string;
            text: string;
            expiresAt?: Date;
        } | {
            id: string;
            inputHash: string;
            source: kit.ConversationNoteSource;
            kind: 'remove';
            key: string;
        }>();
        expectTypeOf<kit.ConversationSnapshot>().toEqualTypeOf<{
            scope: kit.ConversationScope;
            runId: string;
            messages: ModelMessage[];
            itemIds: string[];
            noteKeys: string[];
            createdAt: Date;
            omitted: number;
        }>();
        expectTypeOf<kit.ConversationRecordSnapshot>()
            .toEqualTypeOf<Pick<kit.ConversationSnapshot, 'messages' | 'itemIds' | 'noteKeys' | 'createdAt' | 'omitted'>>();
        expectTypeOf<kit.ConversationRecord>().toEqualTypeOf<{
            id: string;
            key: string;
            identity: kit.ConversationIdentity;
            generation: number;
            activeRunId?: string;
            snapshot?: kit.ConversationRecordSnapshot;
        }>();
        expectTypeOf<kit.ConversationItemRecord>().toEqualTypeOf<Omit<kit.ConversationItem, 'id'> & {
            id: number;
            key: string;
            scopeId: string;
            generation: number;
            bytes: number;
        }>();
        expectTypeOf<kit.ConversationNoteRecord>().toEqualTypeOf<kit.ConversationNote & {
            id: string;
            scopeId: string;
            generation: number;
        }>();
        expectTypeOf<kit.ConversationOperationRecord>().toEqualTypeOf<{
            id: string;
            scopeId: string;
            generation: number;
            operationId: string;
            runId: string;
            inputHash: string;
            kind: 'set' | 'remove';
            key: string;
            removed?: boolean;
            createdAt: Date;
        }>();
    });

    it('keeps the effect, idempotency, limit and lock records', () => {
        expectTypeOf<kit.EffectRecord>().toEqualTypeOf<{
            id: string;
            key: string;
            result: unknown;
        }>();
        expectTypeOf<kit.IdempotencyKey>().toEqualTypeOf<{
            id: string;
            scope: string;
            key: string;
            runId: string;
            expiresAt: Date;
        }>();
        expectTypeOf<kit.LimitUse>().toEqualTypeOf<{
            id: string;
            scope: string;
            key: string;
            weight: number;
            createdAt: Date;
        }>();
        expectTypeOf<kit.Lock>().toEqualTypeOf<{
            id: string;
            key: string;
            owner: string;
            expiresAt: Date;
            token: number;
        }>();
    });

    it('keeps the state records', () => {
        expectTypeOf<kit.StateEntry>().toEqualTypeOf<{
            id: string;
            agent: string;
            key: string;
            value: unknown;
        }>();
        expectTypeOf<kit.StateDocument>().toEqualTypeOf<{
            id: string;
            agent: string;
            collection: string;
            documentId: string;
            doc: unknown;
        }>();
    });

    it('keeps the step record', () => {
        expectTypeOf<kit.Step>().toEqualTypeOf<{
            runId: string;
            index: number;
            kind: 'llm' | 'tool' | 'wait';
            name?: string;
            input?: unknown;
            output?: unknown;
            error?: unknown;
            startedAt: Date;
            finishedAt: Date;
        }>();
    });

    it('keeps the trigger records', () => {
        expectTypeOf<kit.Invoker>().toEqualTypeOf<{
            id: string;
            kind: string;
            name?: string;
            bindings: readonly PermissionBinding[];
            authorization?: PermissionAuthorization;
            identity?: PermissionIdentity;
        }>();
        expectTypeOf<kit.TriggerSource>().toEqualTypeOf<{
            channel: string;
            address: string;
        }>();
        expectTypeOf<kit.DispatchParent>().toEqualTypeOf<{
            kind: 'dispatch';
            runId: string;
            agent: string;
            role: string;
            depth: number;
            source?: kit.TriggerSource;
        }>();
        expectTypeOf<kit.PeerParent>().toEqualTypeOf<{
            kind: 'peer';
            peer: string;
            runId: string;
            standIn: string;
            agent: string;
            role: string;
            depth: number;
            origin?: string;
        }>();
        expectTypeOf<kit.TriggerParent>().toEqualTypeOf<kit.DispatchParent | kit.PeerParent>();
        expectTypeOf<kit.TriggerEnvelope>().toEqualTypeOf<{
            id: string;
            agent: string;
            trigger: string;
            channel: string;
            payload: unknown;
            idempotencyKey?: string;
            concurrencyKey?: string;
            address?: string;
            attachments?: kit.Artifact[];
            invoker?: kit.Invoker;
            parent?: kit.TriggerParent;
            receivedAt: Date;
        }>();
        expectTypeOf<kit.TriggerEnvelope<{ n: number }>['payload']>().toEqualTypeOf<{ n: number }>();
    });

    it('keeps the run records', () => {
        expectTypeOf<kit.Usage>().toEqualTypeOf<{
            inputTokens: number;
            outputTokens: number;
        }>();
        expectTypeOf<kit.RunTaint>().toEqualTypeOf<{ at: Date; source: string }>();
        expectTypeOf<kit.ApprovalWaitPoint>().toEqualTypeOf<{
            kind: 'approval';
            id: string;
            approvalId: string;
            toolName: string;
            toolCallId: string;
            title: string;
            body?: string;
            notification?: string;
            artifacts?: string[];
            options?: kit.ApprovalOption[];
            multiple?: boolean;
            channel?: string;
            address?: string;
            slot?: string;
            expiresAt: Date;
            notifiedAt?: Date;
        }>();
        expectTypeOf<kit.DispatchWaitPoint>().toEqualTypeOf<{
            kind: 'dispatch';
            id: string;
            toolName: string;
            toolCallId: string;
            runIds: string[];
            expiresAt: Date;
        }>();
        expectTypeOf<kit.RemoteApproval>().toEqualTypeOf<{
            runId: string;
            approvalId: string;
            title: string;
            url?: string;
            notifiedAt?: Date;
        }>();
        expectTypeOf<kit.RemoteWaitPoint>().toEqualTypeOf<{
            kind: 'remote';
            id: 'remote';
            peer: string;
            agent: string;
            remoteRunId: string;
            expiresAt: Date;
            wakeRequested?: boolean;
            remote?: {
                status: kit.RunStatusLiteral;
                approval?: kit.RemoteApproval;
            };
        }>();
        expectTypeOf<kit.WaitPoint>().toEqualTypeOf<kit.ApprovalWaitPoint | kit.DispatchWaitPoint | kit.RemoteWaitPoint>();
        expectTypeOf<kit.Run>().toEqualTypeOf<{
            id: string;
            agent: string;
            status: kit.RunStatusLiteral;
            taint?: kit.RunTaint;
            trigger: kit.TriggerEnvelope;
            concurrencyKey?: string;
            address?: string;
            output?: unknown;
            error?: { code: string; message: string };
            usage: kit.Usage;
            subtreeUsage?: kit.Usage;
            parentRunId?: string;
            waiting?: kit.WaitPoint;
            claim?: { owner: string; expiresAt: Date };
            cancelRequested?: boolean;
            agentRevision?: string;
            conversation?: kit.ConversationBinding;
            createdAt: Date;
            updatedAt: Date;
            startedAt?: Date;
            finishedAt?: Date;
        }>();
    });
});
