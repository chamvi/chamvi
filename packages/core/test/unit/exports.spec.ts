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
import type * as sdk from 'ai';
import * as persistence from '@chamvi/core/conversation/persistence';

describe('public api', () => {
    it('keeps the engine interface aligned with the public class contract', () => {
        expectTypeOf<keyof core.Engine>().toEqualTypeOf<keyof core.IEngine>();
        expectTypeOf<InstanceType<typeof core.Engine>>().toExtend<core.IEngine>();
        expectTypeOf<core.IEngine>().toExtend<Pick<core.Engine, keyof core.IEngine>>();
    });

    it('types the store as a collection of repositories with conversation support from the memory factory', () => {
        expectTypeOf<core.EngineOptions['store']>().toEqualTypeOf<core.IStore>();
        expectTypeOf<core.IEngine['store']>().toEqualTypeOf<core.IStore>();
        expectTypeOf<ReturnType<typeof core.createMemoryStore>['conversations']>()
            .toEqualTypeOf<core.IConversationRepository>();
        expect(core).not.toHaveProperty('createMemoryRepositories');
    });

    it('leaves permission checks to @chamvi/access', () => {
        for (const name of ['hasPermission', 'matchesPermission', 'toolPermission', 'PERMISSION_ALL', 'can', 'Permission']) {
            expect(core).not.toHaveProperty(name);
        }
    });

    it('publishes conversation persistence separately from the agent api', () => {
        const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

        expect(manifest.exports['./conversation/persistence']).toEqual({
            types: './dist/conversation/persistence.d.mts',
            import: './dist/conversation/persistence.mjs',
        });
    });

    it('exposes only store persistence rules from its dedicated entry', () => {
        const names = [
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
        ];

        expect(Object.keys(persistence).sort()).toEqual(names);

        for (const name of names) {
            expect(persistence[name as keyof typeof persistence]).toBeTypeOf('function');
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

    it.each([
        'createMemoryStore',
        'defineModelAgent',
        'defineSimpleAgent',
        'Engine',
        'formatRevision',
        'MemoryAgentRevisionRepository',
        'MemoryArtifactRepository',
        'MemoryCheckpointRepository',
        'MemoryConnectionRepository',
        'MemoryEffectRepository',
        'MemoryIdempotencyRepository',
        'MemoryLockRepository',
        'MemoryRunRepository',
        'MemoryStateRepository',
        'MemoryStepRepository',
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
        'normalizeEnvelope',
        'normalizeWaitPoint',
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
        'checkAgentModel',
        'resolveModel',
        'extract',
        'agentChannel',
        'dispatch',
        'dispatchTo',
        'dispatchTools',
        'findApprovalWaitBelow',
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
        expectTypeOf<core.TriggerEnvelope>().toHaveProperty('parent').toEqualTypeOf<core.TriggerParent | undefined>();
        expectTypeOf<ReturnType<typeof core.dispatch>>().toEqualTypeOf<Promise<core.DispatchResult>>();
        expectTypeOf<core.DispatchInput>().toEqualTypeOf<{
            role?: string;
            payload: unknown;
            idempotencyKey?: string;
            concurrencyKey?: string;
            address?: string;
            source?: core.TriggerSource;
        }>();
        expectTypeOf<core.TriggerSource>().toEqualTypeOf<{ channel: string; address: string }>();
        expectTypeOf<core.TriggerParent['source']>().toEqualTypeOf<core.TriggerSource | undefined>();
        expectTypeOf<core.AgentSubscriber['on']>().returns.toEqualTypeOf<core.ChannelSubscription<unknown>>();
        expectTypeOf<core.AgentSubscriptionOptions>().toHaveProperty('maxDepth').toEqualTypeOf<number | undefined>();
        expectTypeOf<core.AgentSubscriptionOptions>().toHaveProperty('from').toEqualTypeOf<string[] | undefined>();
        expectTypeOf<ReturnType<typeof core.dispatchTo>>().toEqualTypeOf<Promise<core.DispatchResult>>();
        expectTypeOf<ReturnType<typeof core.findApprovalWaitBelow>>().toEqualTypeOf<Promise<core.Run | undefined>>();
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
        expect(core.MemoryConversationRepository).toBeTypeOf('function');
        expectTypeOf<core.MemoryConversationRepositoryOptions>().toEqualTypeOf<{ clock?: core.IClock; hasRun?: (runId: string) => boolean }>();
        expectTypeOf<core.MemoryRunReferenceOptions>().toEqualTypeOf<{ hasRun?: (runId: string) => boolean }>();
        expectTypeOf<core.MemoryConversationRepository>().toMatchTypeOf<core.IConversationRepository>();

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

        expectTypeOf<core.ConversationIdentity>().toEqualTypeOf<{
            agent: string;
            channel: string;
            account: string;
            chat: string;
            audience: string;
        }>();
        expectTypeOf<core.ConversationScope>().toEqualTypeOf<{
            id: string;
            generation: number;
            identity: core.ConversationIdentity;
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
        expectTypeOf<core.ConversationBinding>().toEqualTypeOf<{ scope: core.ConversationScope; text: string }>();
        expectTypeOf<core.ConversationAccess>().toEqualTypeOf<{
            agent: string;
            operation: 'dispatch' | 'recall' | 'notes';
            identity: core.ConversationIdentity;
            invoker?: core.Invoker;
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
        expectTypeOf<core.ConversationNoteOperation>().toHaveProperty('kind').toEqualTypeOf<'set' | 'remove'>();
        expectTypeOf<core.IConversationRepository['findOne']>()
            .toEqualTypeOf<(identity: core.ConversationIdentity) => Promise<core.ConversationScope | undefined>>();
        expectTypeOf<core.IStore>().not.toHaveProperty('resolve');
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
        expectTypeOf<core.ApprovalOption>().toEqualTypeOf<{
            id: string;
            label: string;
            detail?: string;
            artifacts?: string[]
        }>();
        expectTypeOf<core.ApprovalRequestInput['artifacts']>().toEqualTypeOf<string[] | undefined>();
        expectTypeOf<core.ApprovalWaitPoint['artifacts']>().toEqualTypeOf<string[] | undefined>();
        expectTypeOf<core.ApprovalRequestInput['options']>().toEqualTypeOf<core.ApprovalOption[] | undefined>();
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
        expectTypeOf<core.ChannelSendOptions>().toEqualTypeOf<{ signal: AbortSignal; trigger: core.TriggerEnvelope }>();
        expectTypeOf<core.ChannelMessage['kind']>().toEqualTypeOf<'message' | 'approval'>();
        expectTypeOf<core.ChannelSubscription>().toHaveProperty('channel').toEqualTypeOf<string>();
        expectTypeOf<core.IChannel>().toHaveProperty('name').toEqualTypeOf<string>();
        expectTypeOf<core.TriggerEnvelope>().toHaveProperty('channel').toEqualTypeOf<string>();
        expectTypeOf<core.Run>().toHaveProperty('address').toEqualTypeOf<string | undefined>();
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
        expectTypeOf<core.ApprovalWaitPoint['slot']>().toEqualTypeOf<string | undefined>();
        expectTypeOf<core.WaitPoint>().toEqualTypeOf<core.ApprovalWaitPoint | core.DispatchWaitPoint>();
        expectTypeOf<core.DispatchWaitPoint['runIds']>().toEqualTypeOf<string[]>();
        expectTypeOf<core.Run['parentRunId']>().toEqualTypeOf<string | undefined>();
        expectTypeOf<core.Run['subtreeUsage']>().toEqualTypeOf<core.Usage | undefined>();
        expectTypeOf<core.TriggerParent['kind']>().toEqualTypeOf<'dispatch'>();
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

    it('exports the connection repository contract', () => {
        expect(core.CONNECTION_ENTRY_KEY_MAX_LENGTH).toBe(255);
        expect(core.CONNECTION_TYPE_MAX_LENGTH).toBe(64);
        expect(core.CONNECTION_SECRET_FIELD_MAX_LENGTH).toBe(64);
        expectTypeOf<core.IStore['connections']>().toEqualTypeOf<core.IConnectionRepository | undefined>();
        expectTypeOf<ReturnType<typeof core.createMemoryStore>['connections']>()
            .toEqualTypeOf<core.IConnectionRepository>();
        expectTypeOf<core.Connection>().toEqualTypeOf<{
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
        }>();
        expectTypeOf<core.ConnectionConfigWrite>().toEqualTypeOf<{
            settings?: Record<string, unknown>;
            setSecrets?: Record<string, Uint8Array>;
            clearSecrets?: readonly string[];
        }>();
        expectTypeOf<core.ILockRepository['renew']>().toEqualTypeOf<(key: string, owner: string, ttlMs: number) => Promise<boolean>>();
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
        expectTypeOf<core.ConnectionState>().toEqualTypeOf<'configured' | 'not_configured' | 'incomplete'>();
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
        expectTypeOf<core.ConnectionConfigView>().toEqualTypeOf<{
            settings: Record<string, unknown>;
            secretsSet: string[];
            revision: number;
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
            store: core.IStore; 
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
        expectTypeOf<core.AgentRevision>().toHaveProperty('hash').toEqualTypeOf<string>();
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

    it('exports the RunStatus enum', () => {
        expect(core.RunStatus.QUEUED).toBe('queued');
    });

    it('exports the ApprovalAnswer type', () => {
        expectTypeOf<core.ApprovalAnswer>().toEqualTypeOf<{
            approvalId: string;
            approved: boolean;
            reason?: string;
            approver?: core.Invoker;
            selected?: string[];
        }>();
    });

    it('exports the ApprovalDecision type', () => {
        expectTypeOf<core.ApprovalDecision>().toEqualTypeOf<{
            approved: boolean;
            reason?: string;
            approver?: core.Invoker;
            selected?: string[];
        }>();
    });
});
