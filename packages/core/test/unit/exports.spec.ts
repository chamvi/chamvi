/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import * as core from '@chamvi/core';
import type * as store from '@chamvi/store';
import type * as sdk from 'ai';
import type {
    AgentRevision,
    IAgentRevisionRepository,
    IArtifactRepository,
    ICheckpointRepository,
    IConnectionRepository,
    IConversationRepository,
    IEffectRepository,
    IIdempotencyRepository,
    ILimitRepository,
    ILockRepository,
    IRunRepository,
    IStateDocumentRepository,
    IStateRepository,
    IStepRepository,
} from '@chamvi/store';

describe('public api', () => {
    it('keeps the engine interface aligned with the public class contract', () => {
        expectTypeOf<keyof core.Engine>().toEqualTypeOf<keyof core.IEngine>();
        expectTypeOf<InstanceType<typeof core.Engine>>().toExtend<core.IEngine>();
        expectTypeOf<core.IEngine>().toExtend<Pick<core.Engine, keyof core.IEngine>>();
    });

    it('has no store aggregate: the engine takes and exposes each service by name', () => {
        expectTypeOf<core.EngineOptions>().not.toHaveProperty('store');
        expectTypeOf<core.IEngine>().not.toHaveProperty('store');
        expect(Object.keys(core).filter((name) => /^create(Memory|Database)(Store|Repositories)$/.test(name))).toEqual([]);
        expect(Object.keys(core).filter((name) => /^(I|Memory)Store(Options)?$/.test(name))).toEqual([]);
    });

    it('serves runs and steps through services over the repository ports of @chamvi/store', () => {
        expectTypeOf<core.EngineOptions['runService']>().toEqualTypeOf<core.IRunService>();
        expectTypeOf<core.EngineOptions['stepService']>().toEqualTypeOf<core.IStepService>();
        expectTypeOf<core.IEngine['runService']>().toEqualTypeOf<core.IRunService>();
        expectTypeOf<core.IEngine['stepService']>().toEqualTypeOf<core.IStepService>();
        expectTypeOf<core.RunServiceContext['repository']>().toEqualTypeOf<IRunRepository>();
        expectTypeOf<core.StepServiceContext['repository']>().toEqualTypeOf<IStepRepository>();

        // the ports and the memory repositories moved to @chamvi/store and @chamvi/store-memory
        for (const name of ['MemoryRunRepository', 'MemoryStepRepository', 'IRunRepository', 'IStepRepository']) {
            expect(core).not.toHaveProperty(name);
        }
    });

    it('serves checkpoints, effects, artifacts and state through services over the repository ports of @chamvi/store', () => {
        expectTypeOf<core.EngineOptions['checkpointService']>().toEqualTypeOf<core.ICheckpointService>();
        expectTypeOf<core.EngineOptions['effectService']>().toEqualTypeOf<core.IEffectService>();
        expectTypeOf<core.EngineOptions['artifactService']>().toEqualTypeOf<core.IArtifactService>();
        expectTypeOf<core.EngineOptions['stateService']>().toEqualTypeOf<core.IStateService>();
        expectTypeOf<core.IEngine['checkpointService']>().toEqualTypeOf<core.ICheckpointService>();
        expectTypeOf<core.IEngine['effectService']>().toEqualTypeOf<core.IEffectService>();
        expectTypeOf<core.IEngine['artifactService']>().toEqualTypeOf<core.IArtifactService>();
        expectTypeOf<core.IEngine['stateService']>().toEqualTypeOf<core.IStateService>();
        expectTypeOf<core.CheckpointServiceContext['repository']>().toEqualTypeOf<ICheckpointRepository>();
        expectTypeOf<core.EffectServiceContext['repository']>().toEqualTypeOf<IEffectRepository>();
        expectTypeOf<core.ArtifactServiceContext['repository']>().toEqualTypeOf<IArtifactRepository>();
        expectTypeOf<core.StateServiceContext['repository']>().toEqualTypeOf<IStateRepository>();
        expectTypeOf<core.StateServiceContext['documentRepository']>().toEqualTypeOf<IStateDocumentRepository>();
        expectTypeOf<core.StateFindOptions>().toEqualTypeOf<{ limit?: number; offset?: number }>();
        expectTypeOf<core.StateDocumentFindOptions>().toEqualTypeOf<{ where?: Record<string, unknown>; limit?: number }>();

        // the ports and the memory repositories moved to @chamvi/store and @chamvi/store-memory
        for (const name of [
            'MemoryCheckpointRepository',
            'MemoryEffectRepository',
            'MemoryArtifactRepository',
            'MemoryStateRepository',
            'ICheckpointRepository',
            'IEffectRepository',
            'IArtifactRepository',
            'IStateRepository',
        ]) {
            expect(core).not.toHaveProperty(name);
        }
    });

    it('serves locks and idempotency keys through services over the repository ports of @chamvi/store', () => {
        expectTypeOf<core.EngineOptions['lockService']>().toEqualTypeOf<core.ILockService>();
        expectTypeOf<core.EngineOptions['idempotencyService']>().toEqualTypeOf<core.IIdempotencyService>();
        expectTypeOf<core.IEngine['lockService']>().toEqualTypeOf<core.ILockService>();
        expectTypeOf<core.IEngine['idempotencyService']>().toEqualTypeOf<core.IIdempotencyService>();
        expectTypeOf<core.LockServiceContext['repository']>().toEqualTypeOf<ILockRepository>();
        expectTypeOf<core.IdempotencyServiceContext['repository']>().toEqualTypeOf<IIdempotencyRepository>();
        expectTypeOf<core.LockService['acquire']>().toEqualTypeOf<(key: string, owner: string, ttlMs: number) => Promise<number | undefined>>();
        expectTypeOf<core.LockService['renew']>().toEqualTypeOf<(key: string, owner: string, ttlMs: number) => Promise<boolean>>();
        expectTypeOf<core.LockService['release']>().toEqualTypeOf<(key: string, owner: string) => Promise<void>>();
        expectTypeOf<core.LockService['holds']>().toEqualTypeOf<(key: string, owner: string) => Promise<boolean>>();
        expectTypeOf<core.LockService['purgeExpired']>().toEqualTypeOf<(now?: Date) => Promise<number>>();
        expectTypeOf<core.IdempotencyService['claim']>()
            .toEqualTypeOf<(scope: string, key: string, runId: string, ttlMs: number) => Promise<core.IdempotencyClaim>>();
        expectTypeOf<core.IdempotencyService['purgeExpired']>().toEqualTypeOf<(now?: Date) => Promise<number>>();
        expectTypeOf<core.IdempotencyClaim>().toEqualTypeOf<{ created: boolean; runId: string }>();

        // the ports and the memory repositories moved to @chamvi/store and @chamvi/store-memory
        for (const name of ['MemoryLockRepository', 'MemoryIdempotencyRepository', 'ILockRepository', 'IIdempotencyRepository']) {
            expect(core).not.toHaveProperty(name);
        }
    });

    it('serves tool limit uses through a service over the repository port of @chamvi/store', () => {
        expectTypeOf<core.EngineOptions['limitService']>().toEqualTypeOf<core.ILimitService | undefined>();
        expectTypeOf<core.IEngine['limitService']>().toEqualTypeOf<core.ILimitService | undefined>();
        expectTypeOf<core.LimitServiceContext['repository']>().toEqualTypeOf<ILimitRepository>();
        expectTypeOf<core.LimitService['used']>().toEqualTypeOf<(scope: string, windowMs: number) => Promise<number>>();
        expectTypeOf<core.LimitService['has']>().toEqualTypeOf<(scope: string, key: string) => Promise<boolean>>();
        expectTypeOf<core.LimitService['record']>()
            .toEqualTypeOf<(scope: string, key: string, weight: number) => Promise<void>>();
        expectTypeOf<core.LimitService['purgeExpired']>().toEqualTypeOf<(now?: Date) => Promise<number>>();
        expectTypeOf<core.AgentLimits>().toEqualTypeOf<Record<string, core.ToolLimit | false>>();
        expectTypeOf<core.ToolLimit['onExceed']>().toEqualTypeOf<'approve' | 'deny' | undefined>();
        expectTypeOf<core.ModelAgentDefinition['limits']>().toEqualTypeOf<core.AgentLimits | undefined>();
        expectTypeOf<core.SimpleAgentDefinition['limits']>().toEqualTypeOf<undefined>();

        expect(core.LIMIT_LOCK_TTL_MS).toBe(10_000);
        expect(core.LIMIT_LOCK_RETRY_MS).toBe(100);

        // the validation stays internal, the port and the memory repository live in @chamvi/store and @chamvi/store-memory
        for (const name of [
            'assertToolLimit',
            'assertAgentLimits',
            'enforceToolLimit',
            'bindToolLimits',
            'MemoryLimitRepository',
            'ILimitRepository',
        ]) {
            expect(core).not.toHaveProperty(name);
        }
    });

    it('leaves permission checks to @chamvi/access', () => {
        for (const name of ['hasPermission', 'matchesPermission', 'toolPermission', 'PERMISSION_ALL', 'can', 'Permission']) {
            expect(core).not.toHaveProperty(name);
        }
    });

    it('keeps the conversation persistence policy internal: no package entry of its own', () => {
        const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

        expect(Object.keys(manifest.exports)).toEqual(['./package.json', '.']);

        for (const name of [
            'assertConversationScope',
            'assertConversationText',
            'assertEmitItem',
            'assertNoteOperationContent',
            'assertNoteOperationShape',
            'assertPage',
            'assertRunId',
            'buildSnapshotContent',
            'identityId',
            'isSameEmit',
            'userItemId',
        ]) {
            expect(core).not.toHaveProperty(name);
        }
    });

    it('exports native message aliases and role-specific instruction types', () => {
        expectTypeOf<core.SystemModelMessage>().toEqualTypeOf<sdk.SystemModelMessage>();
        expectTypeOf<core.UserModelMessage>().toEqualTypeOf<sdk.UserModelMessage>();
        expectTypeOf<core.AssistantModelMessage>().toEqualTypeOf<sdk.AssistantModelMessage>();
        expectTypeOf<core.ModelMessage>().toEqualTypeOf<sdk.ModelMessage>();
        expectTypeOf<core.SystemModelMessage['content']>().toEqualTypeOf<string>();
        expectTypeOf<core.UserContent>().toEqualTypeOf<sdk.UserContent>();
        expectTypeOf<core.AssistantContent>().toEqualTypeOf<sdk.AssistantContent>();
        expectTypeOf<core.TextPart>().toEqualTypeOf<sdk.TextPart>();
        expectTypeOf<core.FilePart>().toEqualTypeOf<sdk.FilePart>();
        expectTypeOf<core.AgentInstruction>().toEqualTypeOf<sdk.SystemModelMessage | sdk.UserModelMessage | sdk.AssistantModelMessage>();
        expectTypeOf<core.ModelAgentDefinition['instructions']>().toEqualTypeOf<string | readonly core.AgentInstruction[]>();
        expectTypeOf<core.SkillContribution['instructions']>().toEqualTypeOf<core.AgentInstructions>();
        expectTypeOf<sdk.ToolModelMessage>().not.toExtend<core.AgentInstruction>();
        expect(core).not.toHaveProperty('normalizeInstructions');
        expect(core).not.toHaveProperty('splitInstructions');
    });

    it('serves agent revision markers through a service over the repository port of @chamvi/store', () => {
        expectTypeOf<core.EngineOptions['agentRevisionService']>().toEqualTypeOf<core.IAgentRevisionService>();
        expectTypeOf<core.IEngine['agentRevisionService']>().toEqualTypeOf<core.IAgentRevisionService>();
        expectTypeOf<core.AgentRevisionServiceContext['repository']>().toEqualTypeOf<IAgentRevisionRepository>();
        expectTypeOf<core.AgentRevisionService['findOne']>().toEqualTypeOf<(agent: string) => Promise<AgentRevision | undefined>>();
        expectTypeOf<core.AgentRevisionService['save']>().toEqualTypeOf<(revision: AgentRevision) => Promise<AgentRevision>>();
        expectTypeOf<core.AgentRevisionService['delete']>().toEqualTypeOf<(agent: string) => Promise<void>>();
        expectTypeOf<core.AgentRevisionService['find']>().toEqualTypeOf<() => Promise<AgentRevision[]>>();

        // the port moved to @chamvi/store, the memory repository to @chamvi/store-memory
        for (const name of ['MemoryAgentRevisionRepository', 'IAgentRevisionRepository']) {
            expect(core).not.toHaveProperty(name);
        }
    });

    it.each([
        'defineModelAgent',
        'defineSimpleAgent',
        'defineRemoteAgent',
        'Engine',
        'formatRevision',
        'ConnectionService',
        'ConversationService',
        'AgentRevisionService',
        'ArtifactService',
        'CheckpointService',
        'EffectService',
        'IdempotencyService',
        'LimitService',
        'LockService',
        'RunService',
        'StateService',
        'StepService',
        'defineEffectTool',
        'defineTool',
        'effectMarker',
        'approve',
        'outboundApproved',
        'runSource',
        'ChamviError',
        'BudgetExceededError',
        'ArtifactNotFoundError',
        'RepositoryNotFoundError',
        'ToolNotAllowedError',
        'ToolDeniedError',
        'IncompleteResponseError',
        'SandboxError',
        'requireToolPermission',
        'isArtifactMediaType',
        'artifactFilePart',
        'assertTriggerKey',
        'assertConcurrencyMaxRuns',
        'waitIdOf',
        'consoleChannel',
        'ChannelNotFoundError',
        'defineContextKey',
        'inject',
        'injectClock',
        'tryInject',
        'ContextNotProvidedError',
        'AgentNotFoundError',
        'AgentReplacedError',
        'PeerStartBusyError',
        'isAgentName',
        'checkAgentModel',
        'resolveModel',
        'extract',
        'agentChannel',
        'dispatch',
        'dispatchTo',
        'dispatchTools',
        'findApprovalWaitBelow',
        'pendingApprovalOf',
        'rebaseJsonSchemaRefs',
        'waitForDispatch',
        'createKeyring',
        'parseKeyring',
        'seal',
        'open',
        'DecryptionFailedError',
        'assertConnection',
        'assertConnectionConfigWrite',
        'assertConnectionEntryKey',
        'assertConnectionEntryWrite',
        'assertConnectionName',
        'assertConnectionSettings',
        'isStorableConnectionText',
        'createConnectionConfigStore',
        'createConnectionVault',
        'ConnectionHeldError',
        'ConnectionChangedError',
        'ConnectionNotConfiguredError',
        'resolveConnection',
        'storedConnectionName',
    ])('exports %s', (name) => {
        expect(core).toHaveProperty(name);
        expect(core[name as keyof typeof core]).toBeTypeOf('function');
    });

    it('exports passive skill contracts', () => {
        expectTypeOf<core.ModelAgentDefinition['skills']>().toEqualTypeOf<readonly core.SkillInput[] | undefined>();
        expectTypeOf<core.EngineOptions['skills']>().toEqualTypeOf<readonly core.SkillInput[] | undefined>();
        expectTypeOf<core.SkillInput['runtime']>().toEqualTypeOf<core.ISkillRuntimeProvider>();
        expectTypeOf<ReturnType<core.ISkillRuntimeProvider['create']>>().toEqualTypeOf<core.ISkillRuntime>();
        expect(core).not.toHaveProperty('createSkillCatalog');
        expectTypeOf<core.IEngine['prepare']>().parameter(0).toEqualTypeOf<{ signal?: AbortSignal; agents?: readonly core.Agent[] } | undefined>();
    });

    it('keeps the artifact uri prefix internal', () => {
        expect(core).not.toHaveProperty('ARTIFACT_URI_PREFIX');
    });

    it('exports the tool context schema', () => {
        expect(core.toolContextSchema['~standard'].vendor).toBe('chamvi');
    });

    it('exports the remote agent and peer api', () => {
        expect(core.REMOTE_TIMEOUT_DEFAULT_MS).toBe(86_400_000);
        expect(core.PEER_REQUEST_TIMEOUT_MS).toBe(30_000);
        expect(core.PEER_ORIGIN_MAX_LENGTH).toBe(128);
        expect(core.ErrorCode.REMOTE_FAILED).toBe('remote_failed');
        expect(core.ErrorCode.PEER_START_BUSY).toBe('peer_start_busy');
        expect(new core.PeerStartBusyError('dev', 'r1').code).toBe('peer_start_busy');
        expect(core.AGENT_NAME_MAX_LENGTH).toBe(64);
        expect(core.isAgentName('dev-ops')).toBe(true);
        expect(core.isAgentName('Dev')).toBe(false);
        expect(core.isAgentName('a'.repeat(65))).toBe(false);
        expectTypeOf<core.IEngine['wake']>().toEqualTypeOf<(runId: string, invoker: store.Invoker | undefined) => Promise<core.WakeOutcome | undefined>>();
        expectTypeOf<core.Agent>().toEqualTypeOf<core.ModelAgent | core.SimpleAgent | core.RemoteAgent>();
        expectTypeOf(core.defineRemoteAgent).returns.toEqualTypeOf<core.RemoteAgent>();
        expectTypeOf(core.defineRemoteAgent).parameter(0).toEqualTypeOf<core.RemoteAgentDefinition>();
        expectTypeOf<core.EngineOptions['peers']>().toEqualTypeOf<core.IPeerResolver | undefined>();
        expectTypeOf<core.IEngine['peers']>().toEqualTypeOf<core.IPeerResolver | undefined>();
        expectTypeOf<core.PeerStartInput>().toEqualTypeOf<{
            agent: string;
            role: string;
            payload: unknown;
            attachments?: core.ArtifactInput[];
            idempotencyKey: string;
            peer: {
                standIn: string;
                parent: {
                    runId: string;
                    agent: string;
                    depth: number
                };
                taint: boolean;
                origin?: string;
            };
        }>();
        expectTypeOf<core.PeerRunView>().toEqualTypeOf<{
            id: string;
            status: store.RunStatusLiteral;
            waiting?: store.WaitPoint['kind'];
            approval?: Omit<store.RemoteApproval, 'notifiedAt'>;
            output?: unknown;
            error?: { code: string; message: string };
            tainted: boolean;
            usage: store.Usage;
        }>();
        expectTypeOf<core.PeerSettings>().toEqualTypeOf<{
            pollMs: number;
            untrusted: boolean;
            approvals?: { channel: string; address: string };
            outgoing: boolean;
        }>();
        expectTypeOf<core.PeerRequestOptions>().toEqualTypeOf<{ signal: AbortSignal }>();
        expectTypeOf<core.IPeerTransport['start']>()
            .toEqualTypeOf<(input: core.PeerStartInput, opts: core.PeerRequestOptions) => Promise<{ runId: string }>>();
        expectTypeOf<core.IPeerTransport['read']>()
            .toEqualTypeOf<(runId: string, opts: core.PeerRequestOptions) => Promise<core.PeerRunView>>();
        expectTypeOf<core.IPeerTransport['cancel']>()
            .toEqualTypeOf<(runId: string, opts: core.PeerRequestOptions) => Promise<void>>();
        expectTypeOf<core.IPeerTransport['wake']>()
            .toEqualTypeOf<(standInRunId: string, opts: core.PeerRequestOptions) => Promise<void>>();
        expectTypeOf<core.IPeerResolver['recognize']>().toEqualTypeOf<(invoker: store.Invoker | undefined) => string | undefined>();
        expectTypeOf<core.IPeerResolver['settings']>().toEqualTypeOf<(name: string) => core.PeerSettings>();
        expectTypeOf<core.IPeerResolver['transport']>().toEqualTypeOf<(name: string) => core.IPeerTransport>();
        expectTypeOf<core.IPeerResolver['approvalUrl']>()
            .toEqualTypeOf<((ref: { runId: string; approvalId: string }) => string | undefined) | undefined>();
    });

    it('exports the dispatch api', () => {
        expect(core.AGENT_CHANNEL_NAME).toBe('agent');
        expect(core.DEFAULT_DISPATCH_ROLE).toBe('default');
        expect(core.DEFAULT_DISPATCH_MAX_DEPTH).toBe(1);
        expect(core.DISPATCH_DEPTH_MAX).toBe(8);
        expect(core.DEFAULT_MAX_DISPATCHES_PER_RUN).toBe(100);
        expect(core.DEFAULT_DISPATCH_WAIT_TIMEOUT_MS).toBe(86_400_000);
        expect(core.agent.on).toBeTypeOf('function');
        expect(core).not.toHaveProperty('DISPATCH_CONTEXT');
        expect(core).not.toHaveProperty('claimKey');
        expect(core).not.toHaveProperty('bindRunSnapshot');
        expect(core).not.toHaveProperty('findDispatchRole');
        expect(core).not.toHaveProperty('ancestorsOf');
        expect(core).not.toHaveProperty('DISPATCH_TOOL');
        expect(core).not.toHaveProperty('bindDispatchTools');
        expect(core).not.toHaveProperty('toRoleToolInput');
        expectTypeOf<ReturnType<typeof core.dispatchTools>>().toEqualTypeOf<sdk.ToolSet>();
        expectTypeOf<core.DispatchToolsOptions>().toEqualTypeOf<{
            roles?: string[];
            agents?: { agent: string; roles: string[] }[];
            wait?: boolean | core.DispatchWaitOptions;
        }>();
        expectTypeOf<store.TriggerEnvelope>().toHaveProperty('parent').toEqualTypeOf<store.TriggerParent | undefined>();
        expectTypeOf<ReturnType<typeof core.dispatch>>().toEqualTypeOf<Promise<core.DispatchResult>>();
        expectTypeOf<core.DispatchInput>().toEqualTypeOf<{
            role?: string;
            payload: unknown;
            idempotencyKey?: string;
            concurrencyKey?: string;
            address?: string;
            source?: store.TriggerSource;
        }>();
        expectTypeOf<store.TriggerSource>().toEqualTypeOf<{ channel: string; address: string }>();
        expectTypeOf<store.DispatchParent['source']>().toEqualTypeOf<store.TriggerSource | undefined>();
        expectTypeOf<core.AgentSubscriber['on']>().returns.toEqualTypeOf<core.ChannelSubscription<unknown>>();
        expectTypeOf<core.AgentSubscriptionOptions>().toHaveProperty('maxDepth').toEqualTypeOf<number | undefined>();
        expectTypeOf<core.AgentSubscriptionOptions>().toHaveProperty('from').toEqualTypeOf<string[] | undefined>();
        expectTypeOf<ReturnType<typeof core.dispatchTo>>().toEqualTypeOf<Promise<core.DispatchResult>>();
        expectTypeOf<ReturnType<typeof core.findApprovalWaitBelow>>().toEqualTypeOf<Promise<store.Run | undefined>>();
        expectTypeOf<ReturnType<typeof core.pendingApprovalOf>>().toEqualTypeOf<Omit<store.RemoteApproval, 'notifiedAt'> | undefined>();
        expectTypeOf<core.IRunService['updateWith']>().parameter(1).toEqualTypeOf<(run: store.Run) => Partial<store.Run>>();
        expectTypeOf<core.DispatchToInput>().toEqualTypeOf<core.DispatchInput & { agent: string }>();
        expectTypeOf<core.Budget>().toHaveProperty('maxSubtreeTokens').toEqualTypeOf<number | undefined>();
        expectTypeOf<core.DispatchOutcome>().toEqualTypeOf<{
            runId: string;
            agent: string;
            role: string;
            status: 'completed' | 'failed' | 'cancelled' | 'timeout';
            output?: unknown;
            error?: { code: string; message: string };
        }>();
        expectTypeOf<core.DispatchWaitOptions>().toEqualTypeOf<{ timeoutMs?: number }>();
        expectTypeOf(core.waitForDispatch<core.StateSchema>).toBeCallableWith({} as core.ToolContext, 'run-1');
        expect(core).not.toHaveProperty('settledOutcomes');
        expect(core).not.toHaveProperty('answerDispatchWait');
        expect(core).not.toHaveProperty('onRunSettled');
        expectTypeOf<core.ApprovalRequest['kind']>().toEqualTypeOf<'approval'>();
    });

    it.each([
        'startHandoff',
        'handoff',
        'HANDOFF_SUBSCRIPTION_ID',
        'MAX_HANDOFF_DEPTH',
        'DEFAULT_MAX_HANDOFFS_PER_RUN',
        'HANDOFF_CONTEXT',
    ])('does not export the hand-off name %s', (name) => {
        expect(core).not.toHaveProperty(name);
    });

    it('exports the conversation contract', () => {
        expect(core.CONVERSATION_FIELD_MAX_LENGTH).toBe(255);
        expect(core.DEFAULT_CONVERSATION_LIMITS.maxItems).toBe(20);
        expect(core.CONVERSATION_LIMITS_MAX.maxItems).toBe(100);
        expect(Object.isFrozen(core.DEFAULT_CONVERSATION_LIMITS)).toBe(true);
        expect(Object.isFrozen(core.CONVERSATION_LIMITS_MAX)).toBe(true);
        expect(core.CONVERSATION_NOTE_KEY_MAX_LENGTH).toBe(128);
        expect(core.CONVERSATION_NOTE_TEXT_MAX_BYTES).toBe(2048);
        expect(core.CONVERSATION_NOTES_MAX).toBe(100);
        expect(core.ConversationService).toBeTypeOf('function');
        expectTypeOf<core.ConversationServiceContext>().toEqualTypeOf<{ repository: IConversationRepository; clock: core.IClock }>();
        expectTypeOf<core.EngineOptions['conversationService']>().toEqualTypeOf<core.IConversationService | undefined>();
        expectTypeOf<core.IEngine['conversationService']>().toEqualTypeOf<core.IConversationService | undefined>();
        expectTypeOf<core.IConversations['service']>().toEqualTypeOf<core.IConversationService>();

        // the port and the memory repository moved to @chamvi/store and @chamvi/store-memory
        for (const name of ['MemoryConversationRepository', 'MemoryConversationRepositoryOptions', 'MemoryRunReferenceOptions', 'IConversationRepository']) {
            expect(core).not.toHaveProperty(name);
        }

        for (const name of [
            'normalizeConversationLimits',
            'identityId',
            'conversationConcurrencyKey',
            'assertConversationIdentity',
            'assertConversationText',
            'assertConversationScope',
            'buildSnapshotContent',
            'userItemId',
            'isSameEmit',
            'assertNoteOperationShape',
            'assertNoteOperationContent',
        ]) {
            expect(core).not.toHaveProperty(name);
        }

        expectTypeOf<store.ConversationIdentity>().toEqualTypeOf<{
            agent: string;
            channel: string;
            account: string;
            chat: string;
            audience: string;
        }>();
        expectTypeOf<store.ConversationScope>().toEqualTypeOf<{
            id: string;
            generation: number;
            identity: store.ConversationIdentity;
        }>();
        expectTypeOf<core.ConversationTarget>().toEqualTypeOf<{
            account: string;
            chat: string;
            audience: string;
            text: string;
        }>();
        expectTypeOf<core.ConversationRef>().toEqualTypeOf<{
            channel: string;
            account: string;
            chat: string;
            audience: string;
            address?: string;
        }>();
        expectTypeOf<store.ConversationBinding>().toEqualTypeOf<{ scope: store.ConversationScope; text: string }>();
        expectTypeOf<core.ConversationAccess>().toEqualTypeOf<{
            agent: string;
            operation: 'dispatch' | 'recall' | 'notes';
            identity: store.ConversationIdentity;
            invoker?: store.Invoker;
        }>();
        expectTypeOf<core.ConversationOptions>().toEqualTypeOf<{
            authorize: (access: core.ConversationAccess) => boolean | Promise<boolean>;
            limits?: core.ConversationLimits;
        }>();
        expectTypeOf<core.EngineOptions['conversations']>().toEqualTypeOf<core.ConversationOptions | undefined>();
        expectTypeOf<core.ResolvedConversationLimits>().toEqualTypeOf<{
            readonly maxItems: number;
            readonly maxHistoryBytes: number;
            readonly maxNotesBytes: number;
            readonly maxItemBytes: number;
            readonly retentionMs: number;
            readonly maxStoredItems: number;
        }>();
        expectTypeOf<core.ConversationNoteResult>().toEqualTypeOf<
            {
                kind: 'set';
                key: string;
                updatedAt: Date
            } | {
                kind: 'remove';
                key: string;
                removed: boolean
            }
        >();
        expectTypeOf<store.ConversationNoteOperation>().toHaveProperty('kind').toEqualTypeOf<'set' | 'remove'>();
        expectTypeOf<core.ConversationService['findOne']>()
            .toEqualTypeOf<(identity: store.ConversationIdentity) => Promise<store.ConversationScope | undefined>>();
    });

    it('exports the trigger key bound', () => {
        expect(core.TRIGGER_KEY_MAX_LENGTH).toBe(255);
    });

    it('removes the trigger factories', () => {
        expect(core).not.toHaveProperty('cron');
        expect(core).not.toHaveProperty('http');
        expect(core).not.toHaveProperty('webhook');
    });

    it('keeps the channel context factory internal', () => {
        expect(core).not.toHaveProperty('createChannelContext');
        expect(core.memoryTools).toBeTypeOf('function');
        expect(core.hasConversation).toBeTypeOf('function');
        expect(core).not.toHaveProperty('conversationFor');
        expect(core).not.toHaveProperty('bindConversationRun');
        expect(core).not.toHaveProperty('assertChannelName');
        expect(core).not.toHaveProperty('createChannelHandle');
        expect(core).not.toHaveProperty('runToolCall');
        expect(core).not.toHaveProperty('currentToolCall');
    });

    it('exports the approval timeout bounds', () => {
        expect(core.DEFAULT_APPROVAL_TIMEOUT_MS).toBe(24 * 60 * 60 * 1000);
        expect(core.APPROVAL_TIMEOUT_MAX_MS).toBe(2 ** 31 - 1);
    });

    it('exports the approval option limits', () => {
        expect(core.APPROVAL_OPTIONS_MAX).toBe(20);
        expect(core.APPROVAL_OPTION_ID_PATTERN).toBeInstanceOf(RegExp);
        expect(core.APPROVAL_OPTION_LABEL_MAX_LENGTH).toBe(200);
        expect(core.APPROVAL_OPTION_DETAIL_MAX_LENGTH).toBe(20_000);
        expect(core.APPROVAL_OPTIONS_DETAIL_MAX_LENGTH).toBe(100_000);
        expect(core.APPROVAL_ARTIFACTS_PER_OPTION_MAX).toBe(20);
        expect(core.APPROVAL_ARTIFACTS_MAX).toBe(100);
        expect(core).not.toHaveProperty('toApprovalOptions');
    });

    it('exports the approval option types', () => {
        expectTypeOf<store.ApprovalOption>().toEqualTypeOf<{
            id: string;
            label: string;
            detail?: string;
            artifacts?: string[]
        }>();
        expectTypeOf<core.ApprovalRequestInput['artifacts']>().toEqualTypeOf<string[] | undefined>();
        expectTypeOf<store.ApprovalWaitPoint['artifacts']>().toEqualTypeOf<string[] | undefined>();
        expectTypeOf<core.ApprovalRequestInput['options']>().toEqualTypeOf<store.ApprovalOption[] | undefined>();
        expectTypeOf<core.ApprovalRequestInput['multiple']>().toEqualTypeOf<boolean | undefined>();
    });

    it('keeps the approval internals internal', () => {
        expect(core).not.toHaveProperty('SuspendSignal');
        expect(core).not.toHaveProperty('requestApproval');
        expect(core).not.toHaveProperty('SUSPENDED_RESULT');
    });

    it('removes the notifiers', () => {
        expect(core).not.toHaveProperty('consoleNotifier');
    });

    it('removes the resume tokens', () => {
        expect(core).not.toHaveProperty('createResumeToken');
        expect(core).not.toHaveProperty('verifyResumeToken');
        expect(core).not.toHaveProperty('InvalidResumeTokenError');
        expect(core.ErrorCode).not.toHaveProperty('INVALID_RESUME_TOKEN');
    });

    it('exports the channel types', () => {
        expectTypeOf<core.ChannelRequest>().toEqualTypeOf<{ request: Request; subpath: string }>();
        expectTypeOf<core.ChannelDispatchEnvelope>().toEqualTypeOf<Omit<core.DispatchEnvelope, 'channel'>>();
        expectTypeOf<core.ChannelContext['dispatch']>().returns.toEqualTypeOf<Promise<core.DispatchResult>>();
        expectTypeOf<core.ChannelSendOptions>().toEqualTypeOf<{ signal: AbortSignal; trigger: store.TriggerEnvelope }>();
        expectTypeOf<core.ChannelMessage['kind']>().toEqualTypeOf<'message' | 'approval'>();
        expectTypeOf<core.ChannelSubscription>().toHaveProperty('channel').toEqualTypeOf<string>();
        expectTypeOf<core.IChannel>().toHaveProperty('name').toEqualTypeOf<string>();
        expectTypeOf<core.ChannelStatus>().toEqualTypeOf<{
            lastSuccessAt?: number;
            lastErrorAt?: number;
            lastRunAt?: number;
            runningSince?: number;
        }>();
        expectTypeOf<NonNullable<core.IChannel['status']>>().returns.toEqualTypeOf<core.ChannelStatus>();
        expectTypeOf<store.TriggerEnvelope>().toHaveProperty('channel').toEqualTypeOf<string>();
        expectTypeOf<store.Run>().toHaveProperty('address').toEqualTypeOf<string | undefined>();
        expectTypeOf<core.EngineStartOptions>().toEqualTypeOf<{ channels?: boolean; signal?: AbortSignal }>();
        expectTypeOf<core.EmitMessage>().toEqualTypeOf<{
            title?: string;
            body: string;
            key?: string;
            slot?: string
        }>();
        expectTypeOf<core.ChannelHandle['emit']>().returns.toEqualTypeOf<Promise<void>>();
        expectTypeOf<core.ChannelHandle['approve']>().returns.toEqualTypeOf<Promise<core.ApprovalDecision>>();
        expectTypeOf<Parameters<core.ChannelHandle['approve']>[0]>().toEqualTypeOf<core.ApprovalRequestInput & { address?: string; slot?: string }>();
        expectTypeOf<core.ChannelMessage['slot']>().toEqualTypeOf<string | undefined>();
        expectTypeOf<store.ApprovalWaitPoint['slot']>().toEqualTypeOf<string | undefined>();
        expectTypeOf<store.WaitPoint>().toEqualTypeOf<store.ApprovalWaitPoint | store.DispatchWaitPoint | store.RemoteWaitPoint>();
        expectTypeOf<store.DispatchWaitPoint['runIds']>().toEqualTypeOf<string[]>();
        expectTypeOf<store.Run['parentRunId']>().toEqualTypeOf<string | undefined>();
        expectTypeOf<store.Run['subtreeUsage']>().toEqualTypeOf<store.Usage | undefined>();
        expectTypeOf<store.TriggerParent['kind']>().toEqualTypeOf<'dispatch' | 'peer'>();
        expectTypeOf<core.RunFindOptions['parentRunId']>().toEqualTypeOf<string | undefined>();
        expectTypeOf<core.RunUpdateOptions['expectWaitId']>().toEqualTypeOf<string | undefined>();
        expectTypeOf<core.ConsoleChannelOptions>().toHaveProperty('name').toEqualTypeOf<string | undefined>();
    });

    it('exports the sandbox error code', () => {
        expect(core.ErrorCode.SANDBOX).toBe('sandbox_error');
    });

    it('exports the context error code', () => {
        expect(core.ErrorCode.CONTEXT_NOT_PROVIDED).toBe('context_not_provided');
    });

    it('exports the agent not found error code', () => {
        expect(core.ErrorCode.AGENT_NOT_FOUND).toBe('agent_not_found');
    });

    it('exports the keyring contract', () => {
        expect(core.ErrorCode.DECRYPTION_FAILED).toBe('decryption_failed');
        expect(core.KEYRING_KEY_LENGTH).toBe(32);
        expect(core).not.toHaveProperty('SEAL_IV_LENGTH');
        expect(core).not.toHaveProperty('assertKeyId');
        expect(core).not.toHaveProperty('decodeBase64');
        expectTypeOf<core.KeyringKey>().toEqualTypeOf<{ id: string; key: Uint8Array }>();
        expectTypeOf<core.WrappedKey>().toEqualTypeOf<{ keyId: string; wrapped: Uint8Array }>();
        expectTypeOf<ReturnType<core.IKeyring['createDataKey']>>().toEqualTypeOf<{ key: Uint8Array; wrapped: core.WrappedKey }>();
        expectTypeOf<ReturnType<typeof core.parseKeyring>>().toEqualTypeOf<core.KeyringKey[]>();
    });

    it('serves connections through a service over the repository port of @chamvi/store', () => {
        expect(core.CONNECTION_ENTRY_KEY_MAX_LENGTH).toBe(255);
        expect(core.CONNECTION_TYPE_MAX_LENGTH).toBe(64);
        expect(core.CONNECTION_SECRET_FIELD_MAX_LENGTH).toBe(64);
        expectTypeOf<core.EngineOptions['connectionService']>().toEqualTypeOf<core.IConnectionService | undefined>();
        expectTypeOf<core.IEngine['connectionService']>().toEqualTypeOf<core.IConnectionService | undefined>();
        expectTypeOf<core.ConnectionServiceContext>().toEqualTypeOf<{ repository: IConnectionRepository; clock: core.IClock }>();
        expectTypeOf<core.ConnectionService['create']>().toEqualTypeOf<(connection: store.ConnectionInput) => Promise<boolean>>();
        expectTypeOf<core.ConnectionService['findOne']>().toEqualTypeOf<(name: string) => Promise<store.Connection | undefined>>();
        expectTypeOf<core.ConnectionService['findOneOrFail']>().toEqualTypeOf<(name: string) => Promise<store.Connection>>();
        expectTypeOf<core.ConnectionService['find']>().toEqualTypeOf<() => Promise<store.Connection[]>>();
        expectTypeOf<core.ConnectionService['delete']>().toEqualTypeOf<(name: string, fence?: core.ConnectionFence) => Promise<void>>();
        expectTypeOf<core.ConnectionService['replace']>().toEqualTypeOf<(connection: store.ConnectionInput, fence: core.ConnectionFence) => Promise<void>>();
        expectTypeOf<core.ConnectionService['findEntry']>().toEqualTypeOf<(name: string, key: string) => Promise<Uint8Array | undefined>>();
        expectTypeOf<core.ConnectionService['findEntries']>()
            .toEqualTypeOf<(name: string, keys: readonly string[]) => Promise<Map<string, Uint8Array>>>();
        expectTypeOf<core.ConnectionService['writeEntries']>()
            .toEqualTypeOf<(name: string, write: core.ConnectionEntryWrite, fence: core.ConnectionFence) => Promise<void>>();
        expectTypeOf<core.ConnectionService['findConfig']>().toEqualTypeOf<(name: string) => Promise<core.ConnectionConfig | undefined>>();
        expectTypeOf<core.ConnectionService['writeConfig']>().toEqualTypeOf<(
            name: string,
            write: core.ConnectionConfigWrite,
            expected: core.ConnectionWriteExpectation,
        ) => Promise<number>>();
        expectTypeOf<core.ConnectionWriteExpectation>().toEqualTypeOf<{
            wrappedKey: Uint8Array;
            revision?: number;
            generation?: string;
        }>();

        // the port moved to @chamvi/store, the memory repository to @chamvi/store-memory, the fence lookup is gone
        for (const name of ['MemoryConnectionRepository', 'IConnectionRepository', 'MemoryConnectionRepositoryOptions', 'MemoryLockLookup']) {
            expect(core).not.toHaveProperty(name);
        }

        expectTypeOf<store.Connection>().toEqualTypeOf<{
            id: string;
            name: string;
            type: string;
            keyId: string;
            wrappedKey: Uint8Array;
            createdAt: Date;
            updatedAt: Date;
        }>();
        expectTypeOf<core.ConnectionEntryWrite>().toEqualTypeOf<{
            set?: Record<string, Uint8Array>;
            delete?: readonly string[];
            clear?: boolean;
        }>();
        expectTypeOf<core.ConnectionFence>().toEqualTypeOf<{ lock: string; owner: string }>();
        expectTypeOf<core.ConnectionConfig>().toEqualTypeOf<{
            keyId: string;
            wrappedKey: Uint8Array;
            settings: Record<string, unknown>;
            secrets: Map<string, Uint8Array>;
            revision: number;
            generation: string;
        }>();
        expectTypeOf<core.ConnectionConfigWrite>().toEqualTypeOf<{
            settings?: Record<string, unknown>;
            setSecrets?: Record<string, Uint8Array>;
            clearSecrets?: readonly string[];
        }>();
        expect(new core.LeaseLostError({ lock: 'connection:wa' })).toMatchObject({ code: 'lease_lost', lock: 'connection:wa' });
        expect(new core.LeaseLostError('r1')).toMatchObject({ code: 'lease_lost', runId: 'r1' });
    });

    it('exports the connection type contract', () => {
        expect(core.ErrorCode.CONNECTION_NOT_CONFIGURED).toBe('connection_not_configured');
        expect(core.ErrorCode.CONNECTION_CHANGED).toBe('connection_changed');
        expectTypeOf<ReturnType<typeof core.resolveConnection>>().toEqualTypeOf<core.ResolvedConnection>();
        expectTypeOf<Parameters<typeof core.resolveConnection>[0]>().toEqualTypeOf<core.ResolveConnectionInput>();
        expectTypeOf<core.ConnectionFieldKind>().toEqualTypeOf<'string' | 'number' | 'boolean' | 'select' | 'list' | 'secret'>();
        expectTypeOf<core.ConnectionValue>().toEqualTypeOf<string | number | boolean | readonly string[]>();
        expectTypeOf<core.ConnectionValues>().toEqualTypeOf<Record<string, core.ConnectionValue>>();
        expectTypeOf<core.ConnectionState>().toEqualTypeOf<'configured' | 'not_configured' | 'incomplete' | 'failed'>();
        expectTypeOf<core.ConnectionField['env']>().toEqualTypeOf<((connection: string) => string | undefined) | undefined>();
        expectTypeOf<core.ConnectionTypeDefinition['fields']>().toEqualTypeOf<readonly core.ConnectionField[]>();
        expectTypeOf<core.ConnectionFieldSource>().toEqualTypeOf<
        { kind: 'env'; variable: string } | { kind: 'store' } | { kind: 'code' } | { kind: 'unset' }
        >();
        expectTypeOf<core.DeclaredConnection['resolved']>().toEqualTypeOf<core.ResolvedConnection>();
        expectTypeOf<ReturnType<core.IConnectionTypeProvider['connections']>>().toEqualTypeOf<readonly core.DeclaredConnection[]>();
    });

    it('exports the connection config store', () => {
        expect(core).not.toHaveProperty('secretAadOf');
        expectTypeOf<ReturnType<typeof core.createConnectionConfigStore>>().toEqualTypeOf<core.IConnectionConfigStore>();
        expectTypeOf<Parameters<typeof core.createConnectionConfigStore>[0]>().toEqualTypeOf<core.ConnectionConfigStoreOptions>();
        expectTypeOf<core.ConnectionConfigStoreOptions['lockService']>().toEqualTypeOf<Pick<core.LockService, 'acquire' | 'release'>>();
        expectTypeOf<core.ConnectionConfigStoreOptions['connectionService']>().toEqualTypeOf<
            Pick<core.ConnectionService, 'create' | 'findOne' | 'findOneOrFail' | 'findConfig' | 'writeConfig' | 'delete'>
        >();
        expectTypeOf<core.ConnectionConfigView>().toEqualTypeOf<{
            settings: Record<string, unknown>;
            secretsSet: string[];
            revision: number;
            generation: string;
        }>();
        expectTypeOf<core.ConnectionConfigUpdate>().toEqualTypeOf<{
            settings?: Record<string, unknown>;
            secrets?: { set?: Record<string, string>; clear?: readonly string[] };
        }>();
    });

    it('exports the connection vault', () => {
        expect(core.ErrorCode.CONNECTION_HELD).toBe('connection_held');
        expect(core.DEFAULT_CONNECTION_LEASE_TTL_MS).toBe(60_000);
        expect(core).not.toHaveProperty('ConnectionSession');
        expect(core).not.toHaveProperty('lockKeyOf');
        expect(core).not.toHaveProperty('entryAadOf');
        expect(core).not.toHaveProperty('normalizeOpenOptions');
        expectTypeOf<ReturnType<typeof core.createConnectionVault>>().toEqualTypeOf<core.IConnectionVault>();
        expectTypeOf<ReturnType<core.IConnectionVault['open']>>().toEqualTypeOf<Promise<core.IConnectionSession>>();
        expectTypeOf<core.IConnectionSession['lost']>().toEqualTypeOf<Promise<core.LeaseLostError>>();
        expectTypeOf<core.ConnectionOpenOptionsInput>().toEqualTypeOf<{
            type: string;
            owner: string;
            leaseTtlMs?: number;
            signal?: AbortSignal;
            recreate?: boolean;
        }>();
        expectTypeOf<core.ConnectionOpenOptions>().toEqualTypeOf<{
            type: string;
            owner: string;
            leaseTtlMs: number;
            signal?: AbortSignal;
            recreate?: boolean;
        }>();
        expectTypeOf<Parameters<core.IConnectionVault['open']>[1]>().toEqualTypeOf<core.ConnectionOpenOptionsInput>();
        expectTypeOf<core.ConnectionVaultOptions>().toEqualTypeOf<{
            connectionService: Pick<core.ConnectionService, 'create' | 'findOne' | 'findOneOrFail' | 'replace' | 'findEntries' | 'writeEntries'>;
            lockService: Pick<core.LockService, 'acquire' | 'renew' | 'release'>;
            keyring: core.IKeyring;
            clock?: core.IClock
        }>();
    });

    it('exports the agent cancel reason codes', () => {
        expect(core.ErrorCode.AGENT_REPLACED).toBe('agent_replaced');
        expect(core.ErrorCode.AGENT_REMOVED).toBe('agent_removed');
    });

    it('keeps the agent registry internals internal', () => {
        expect(core).not.toHaveProperty('AGENT_LOCK_TTL_MS');
        expect(core).not.toHaveProperty('cancelAgentRuns');
        expect(core).not.toHaveProperty('syncRevision');
    });

    it('exports the agent change event types', () => {
        expectTypeOf<core.AgentChange>().toEqualTypeOf<{
            type: 'agents.changed';
            name: string;
            kind: 'added' | 'replaced' | 'removed';
        }>();
        expectTypeOf<core.EngineEvent>().toEqualTypeOf<core.RunEvent | core.AgentChange | core.AgentRunsCancelled>();
        expectTypeOf<core.AgentRunsCancelled>().toEqualTypeOf<{
            type: 'agents.cancelled';
            name: string;
            reason: 'agent_replaced' | 'agent_removed';
            revision?: string;
            runIds: string[];
        }>();
    });

    it('exports the agent folder types', () => {
        expectTypeOf<store.AgentRevision>().toHaveProperty('hash').toEqualTypeOf<string>();
    });

    it('keeps the context binding internal', () => {
        expect(core).not.toHaveProperty('isContextKey');
        expect(core).not.toHaveProperty('bindProvided');
        expect(core).not.toHaveProperty('providedOf');
        expect(core).not.toHaveProperty('registerContextKey');
    });

    it('exports conversation operation and turn enums with literal-compatible types', () => {
        expect(core.ConversationOperation).toEqual({
            DISPATCH: 'dispatch',
            RECALL: 'recall',
            NOTES: 'notes',
        });
        expect(core.ConversationTurnKind).toEqual({
            READY: 'ready',
            BUSY: 'busy',
            STALE: 'stale',
        });
        expectTypeOf<core.ConversationOperationLiteral>().toEqualTypeOf<'dispatch' | 'recall' | 'notes'>();
        expectTypeOf<core.BeginTurnResult['kind']>().toEqualTypeOf<'ready' | 'busy' | 'stale'>();
    });

    it('leaves the stored record types and their normalizers to @chamvi/store', () => {
        expect(core).not.toHaveProperty('RunStatus');
        expect(core).not.toHaveProperty('normalizeEnvelope');
        expect(core).not.toHaveProperty('normalizeWaitPoint');
    });

    it('exports the ApprovalAnswer type', () => {
        expectTypeOf<core.ApprovalAnswer>().toEqualTypeOf<{
            approvalId: string;
            approved: boolean;
            reason?: string;
            approver?: store.Invoker;
            selected?: string[];
        }>();
    });

    it('exports the ApprovalDecision type', () => {
        expectTypeOf<core.ApprovalDecision>().toEqualTypeOf<{
            approved: boolean;
            reason?: string;
            approver?: store.Invoker;
            selected?: string[];
        }>();
    });
});
