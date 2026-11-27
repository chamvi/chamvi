/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import type {
    LanguageModel,
    ModelMessage,
    StepResult,
    ToolSet,
} from 'ai';
import { RunStatus } from '@chamvi/store';
import type {
    Checkpoint,
    Step,
    Usage,
} from '@chamvi/store';
import { hydrateMessages } from '../../../artifact/helpers.ts';
import type { ClockTimer } from '../../../clock/types.ts';
import { bindConversationRun } from '../../../conversation/context.ts';
import { bindRunSnapshot } from '../../../dispatch/helpers/index.ts';
import { ArtifactNotFoundError, InvalidAgentDefinitionError } from '../../../errors/index.ts';
import { assertTranscriptMessages, splitInstructions } from '../../../message/helpers.ts';
import { toLanguageModel } from '../../../model/asserts.ts';
import type { Budget, RunContext } from '../../../run/types.ts';
import { bindTrust, markUntrusted } from '../../../trust/module.ts';
import { resolveBudget, timeoutSignal } from '../../budget.ts';
import { CONVERSATION_SEND_GRACE_MS } from '../constants.ts';
import {
    assembleTools,
    createToolContext,
    initialMessage,
    pendingToolCalls,
    toRunError,
} from '../helpers/index.ts';
import type {
    CallSuspendRequest,
    ExecuteContext,
    ExecutionGate,
    PendingToolCall,
} from '../types.ts';
import { replayPendingCalls } from './pending.ts';
import { settleExecutionResult, settleStepLimit } from './settle.ts';
import { handleExecutionStepEnd } from './step.ts';
import { consumeExecutionStream } from './stream.ts';
import type { AssembledTools, ConfiguredInstructions } from './types.ts';

/**
 * One execution of a claimed, `running` run (internal). The locals its phases
 * share are fields: prepare the checkpoint and messages, build the tools,
 * replay the pending calls, consume the model stream (appending steps and
 * checkpoints), settle the run.
 */
export class RunExecution {
    readonly ctx: ExecuteContext;

    readonly gate: ExecutionGate;

    readonly budget: Budget;

    checkpoint: Checkpoint | undefined;

    /** Stored form: file parts hold artifact markers; the model gets a hydrated copy. */
    initial: ModelMessage[] = [];

    prompt: ModelMessage[] = [];

    configured!: ConfiguredInstructions;

    usage!: Usage;

    stepIndex = 0;

    stepSeq = 0;

    /** Calls a suspended approve() left without a result: run before any model call. */
    pending: PendingToolCall[] = [];

    remainingSteps = 0;

    timeout: ReturnType<typeof timeoutSignal> | undefined;

    /** Aborted on every exit, so a stream left unread (e.g. a throw while consuming it) is cancelled. */
    local!: AbortController;

    signal!: AbortSignal;

    runContext!: RunContext;

    /** The calls approve() or waitForDispatch() suspended in this execution, in the order they suspended. */
    readonly suspended: CallSuspendRequest[] = [];

    /** While the pending calls run they belong to the checkpoint's step, later ones to the step being made. */
    replaying = false;

    model!: LanguageModel;

    tools!: AssembledTools['tools'];

    activeTools: AssembledTools['activeTools'];

    toolsContext!: AssembledTools['toolsContext'];

    readonly responseMessages: ModelMessage[] = [];

    /** AI SDK swallows onStepEnd errors; a fatal one is kept here and stops the loop. */
    fatal: { error: unknown } | undefined;

    /** Set once the run settles on abort; a still running stream must not write anymore. */
    abandoned = false;

    pendingStepEnd: Promise<void> = Promise.resolve();

    stepStartedAt!: Date;

    /** The wait the last step suspended on (the first in call order); the loop stops on it. */
    paused: CallSuspendRequest | undefined;

    /**
     * Set when the provider's finish part arrived for the current step; without
     * it the AI SDK synthesizes a finish ('other') and never runs the step's tools.
     */
    modelCallEnded = false;

    /** The write of the pending call that finished last; an abort waits for it before settling. */
    pendingWrite: Promise<void> = Promise.resolve();

    constructor(ctx: ExecuteContext, gate: ExecutionGate) {
        this.ctx = ctx;
        this.gate = gate;
        this.budget = resolveBudget(ctx.agent);
    }

    async run(): Promise<void> {
        if (!await this.prepare() || !await this.start()) {
            return;
        }

        if (this.pending.length > 0 && !await replayPendingCalls(this)) {
            return;
        }

        const result = await consumeExecutionStream(this);

        if (!result) {
            return;
        }

        await settleExecutionResult(this, result);
    }

    /**
     * Reads the checkpoint, checks the transcript and the instructions, and
     * hydrates the prompt; false once the run settled.
     */
    async prepare(): Promise<boolean> {
        const { ctx } = this;
        const { run, agent } = ctx;

        this.checkpoint = await ctx.checkpointService.findOne(run.id);

        const { checkpoint } = this;

        this.initial = checkpoint?.messages ?? [
            ...(ctx.conversation?.snapshot.messages ?? []),
            initialMessage(run.trigger, ctx.conversation ? run.conversation?.text : undefined),
        ];

        try {
            assertTranscriptMessages(this.initial);
            this.configured = splitInstructions(agent.definition.instructions ?? [], ctx.skills?.instructions ?? []);
        } catch (error) {
            if (!(error instanceof ValidationError || error instanceof InvalidAgentDefinitionError)) {
                throw error;
            }

            await ctx.finish({ status: RunStatus.FAILED, error: toRunError(error) });

            return false;
        }

        this.usage = { ...run.usage };
        this.stepIndex = checkpoint ? checkpoint.stepIndex + 1 : 0;
        this.stepSeq = (await ctx.stepService.find(run.id)).length;
        this.pending = checkpoint ? pendingToolCalls(checkpoint.messages) : [];

        // a resumed approval gets exactly one step beyond maxSteps, so an approval
        // granted (or denied) on the last allowed step still runs and is answered
        const extraSteps = this.pending.length > 0 ? 1 : 0;

        this.remainingSteps = this.budget.maxSteps + extraSteps - this.stepIndex;

        if (this.remainingSteps <= 0) {
            await settleStepLimit(this);

            return false;
        }

        try {
            this.prompt = await hydrateMessages([...this.configured.messages, ...this.initial], ctx.artifactService);
        } catch (error) {
            if (!(error instanceof ArtifactNotFoundError)) {
                throw error;
            }

            await ctx.finish({ status: RunStatus.FAILED, error: toRunError(error) });

            return false;
        }

        return true;
    }

    /**
     * Builds the run's signal and context, marks a recalled conversation,
     * resolves the model and assembles the tools; false once the run settled.
     */
    async start(): Promise<boolean> {
        const { ctx, gate } = this;
        const {
            run,
            agent,
            clock,
        } = ctx;

        this.timeout = this.budget.timeoutMs === undefined ? undefined : timeoutSignal(clock, this.budget.timeoutMs);
        this.local = new AbortController();
        this.signal = AbortSignal.any([ctx.signal, this.local.signal, ...(this.timeout ? [this.timeout.signal] : [])]);
        this.runContext = {
            runId: run.id,
            agent: run.agent,
            trigger: run.trigger,
            signal: this.signal,
        };

        const { runContext } = this;

        bindTrust(runContext, {
            taint: run.taint,
            policy: agent.definition.trust,
            now: () => new Date(clock.now()),
            persist: (taint) => ctx.update({ taint }),
            engine: ctx.engine,
        });

        bindRunSnapshot(runContext);

        if (ctx.conversation) {
            bindConversationRun(runContext, ctx.conversation.capability, run);
        }

        const toolContext = createToolContext(ctx, runContext, gate);

        this.replaying = this.pending.length > 0;

        let assembled: AssembledTools;

        try {
            if (ctx.conversation?.snapshot.messages.length || ctx.conversation?.snapshot.noteKeys.length) {
                await markUntrusted({ run: runContext }, 'conversation:recall');
            }

            this.model = toLanguageModel(ctx.model, ctx.models, agent.name);
            assembled = await assembleTools(ctx, runContext, {
                toolContext,
                gate,
                onSuspend: (request) => {
                    this.suspended.push(request);
                },
                stepIndex: () => (this.replaying ? this.checkpoint!.stepIndex : this.stepIndex),
            });
        } catch (error) {
            this.local.abort();
            this.timeout?.clear();

            if (!(error instanceof InvalidAgentDefinitionError)) {
                throw error;
            }

            await ctx.finish({ status: RunStatus.FAILED, error: toRunError(error) });

            return false;
        }

        this.tools = assembled.tools;
        this.activeTools = assembled.activeTools;
        this.toolsContext = assembled.toolsContext;
        this.stepStartedAt = new Date(clock.now());

        return true;
    }

    /**
     * Runs a store write unless the execution was abandoned meanwhile or lost
     * the run. An abort alone does not stop it: a step that completed before a
     * drain or cancel still lands whole (its tool rows and checkpoint), so a
     * recovery does not re-run it. `checkOwner: false` skips the ownership read
     * for writes that are owner-conditional in the store already (ctx.update).
     */
    async guarded(write: () => Promise<unknown>, { checkOwner = true } = {}): Promise<boolean> {
        if (this.abandoned) {
            return false;
        }

        if (checkOwner && this.ctx.ownsRun && !await this.ctx.ownsRun()) {
            return false;
        }

        if (this.abandoned) {
            return false;
        }

        await write();

        return true;
    }

    async append(step: Omit<Step, 'runId' | 'index'>): Promise<void> {
        const full: Step = {
            ...step,
            runId: this.ctx.run.id,
            index: this.stepSeq,
        };

        if (!await this.guarded(() => this.ctx.stepService.create(full))) {
            return;
        }

        this.stepSeq++;
        this.ctx.onStepAppended(full);
    }

    onStepEnd(step: StepResult<ToolSet>): Promise<void> {
        this.pendingStepEnd = handleExecutionStepEnd(this, step);

        return this.pendingStepEnd;
    }

    /**
     * Conversation sends a tool did not await, bounded: a transport that never settles stops being
     * awaited after a grace, and the execution's abort on exit then ends the send (it stays pending,
     * terminal reconciliation marks it unknown), so pause() and finish() are not held by it.
     */
    async awaitJournal(): Promise<void> {
        const journal = this.ctx.conversation?.capability.idle(this.ctx.run.id);

        if (!journal) {
            return;
        }

        let grace: ClockTimer | undefined;

        try {
            await Promise.race([journal, new Promise<void>((resolve) => {
                grace = this.ctx.clock.setTimeout(resolve, CONVERSATION_SEND_GRACE_MS);
                grace.unref?.();
            })]);
        } finally {
            grace?.clear();
        }
    }

    /** The conversation scope a checkpoint records, when the run has one. */
    checkpointConversation(): Pick<Checkpoint, 'conversation'> {
        const { conversation } = this.ctx;

        return conversation ? {
            conversation: {
                scopeId: conversation.snapshot.scope.id,
                generation: conversation.snapshot.scope.generation,
            },
        } : {};
    }
}
