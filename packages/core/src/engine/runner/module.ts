/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/store';
import { RunStatus } from '@chamvi/store';
import type { ModelAgent, RemoteAgent, SimpleAgent } from '../../agent/types.ts';
import { conversationKey } from '../../agent/asserts.ts';
import { InvalidRunStateError, LeaseLostError } from '../../errors/index.ts';
import type { SkillContribution } from '../../skill/types.ts';
import { onRunSettled } from '../dispatch/module.ts';
import { toRunError } from '../execute/helpers/index.ts';
import { executeRun } from '../execute/module.ts';
import { executeRemoteRun } from '../execute/remote/module.ts';
import { executeSimpleRun } from '../execute/simple.ts';
import type { ExecuteContext, RemoteExecuteContext } from '../execute/types.ts';
import { agentCancelReason } from '../registry/helpers.ts';
import type { EngineRunnerContext, IEngineRunner } from './types.ts';

export class EngineRunner implements IEngineRunner {
    protected readonly ctx: EngineRunnerContext;

    constructor(ctx: EngineRunnerContext) {
        this.ctx = ctx;
    }

    /**
     * The single execution seam: runs one claimed, `running` run to a settled
     * state. `signal` aborts on cancel.
     */
    async execute(run: Run, signal: AbortSignal): Promise<void> {
        const { agents, revisions } = this.ctx.registry;
        const { guard, checkedRuns } = this.ctx;

        // cancel() asked for it while it ran elsewhere (or was interrupted): also for an agent unknown here
        if (run.cancelRequested) {
            await this.settleRun(run.id, { status: RunStatus.CANCELLED });

            return;
        }

        const agent = agents.get(run.agent);
        const skills = agent ? this.ctx.skills.get(agent) : undefined;

        // a stamped run starts only where the agent has a revision (isStale below compares it)
        const unrevised = run.agentRevision !== undefined && revisions.get(run.agent) === undefined;

        if (!agent || !skills || unrevised || !await guard.isCurrent(run.agent)) {
            // removed or replaced since the claim: left for a replica that runs the agent's current revision
            // guarded by status and owner (`expectStatus: [RUNNING]`, `expectOwner`): a taken-over run is left alone
            await this.release(run);

            return;
        }

        // current at the marker's revision, but the run's checked dispatch saw another agent or revision
        const revision = revisions.get(run.agent);

        if (guard.replacedSince(run) || (revision !== undefined && guard.isStale(run, revision))) {
            await this.settleRun(run.id, {
                status: RunStatus.CANCELLED,
                error: agentCancelReason(run.agent, 'replaced', revision),
            });
            checkedRuns.delete(run.id);

            return;
        }

        // started on the agent its check saw
        checkedRuns.delete(run.id);

        if (agent.kind === 'remote') {
            // never a model run: a remote agent's runs are stand-ins
            await executeRemoteRun(this.remoteExecuteContext(run, agent, signal));

            return;
        }

        if (agent.kind === 'simple') {
            // a simple agent takes no conversation, so it skips admission
            await executeSimpleRun(this.executeContext(run, agent, skills, signal));

            return;
        }

        let conversation;

        if (run.conversation) {
            const capability = this.ctx.conversationOperations.capability();
            const key = conversationKey(agent.definition);

            if (key === undefined) {
                throw new InvalidRunStateError('The agent has disabled conversations.');
            }

            if (key !== run.conversation.scope.identity.agent) {
                throw new InvalidRunStateError('The agent conversation key has changed.');
            }

            const admitted = await capability.admit(structuredClone(run));

            if (admitted.kind === 'busy') {
                this.ctx.queue.defer(run.id);

                await this.release(run);

                return;
            }

            if (!await this.ownsRun(run.id)) {
                return;
            }

            if (signal.aborted) {
                await this.settleRun(run.id, { status: RunStatus.CANCELLED });

                return;
            }

            conversation = { capability, snapshot: admitted.snapshot };
        }

        await executeRun(this.executeContext(run, agent, skills, signal, conversation));
    }

    /** What one execution of `run` gets from this engine (an LLM and a simple run alike). */
    executeContext(
        run: Run,
        agent: ModelAgent | SimpleAgent,
        skills: SkillContribution,
        signal: AbortSignal,
        conversation?: ExecuteContext['conversation'],
    ): ExecuteContext {
        return {
            engine: this.ctx.engine,
            conversation,
            run,
            agent,
            skills,
            model: agent.definition.model ?? this.ctx.model,
            models: this.ctx.models,
            stepService: this.ctx.stepService,
            checkpointService: this.ctx.checkpointService,
            effectService: this.ctx.effectService,
            artifactService: this.ctx.artifactService,
            stateService: this.ctx.stateService,
            clock: this.ctx.clock,
            signal,
            finish: (patch) => this.settleRun(run.id, patch),
            update: (patch) => this.executionUpdate(run.id, patch),
            onStepAppended: (step) => this.ctx.emit({ type: 'step.appended', step }),
            onDelta: (delta) => this.ctx.emit({ type: 'run.delta', delta }),
            pause: (request, usage) => this.ctx.pause(run, request, usage),
            ownsRun: () => this.ownsRun(run.id),
            provided: this.ctx.provided,
        };
    }

    /** An execution's patch of its still `running` run, emitted; InvalidRunStateError once another owner took it over. */
    async executionUpdate(runId: string, patch: Partial<Run>): Promise<Run> {
        const updated = await this.ownedUpdate(runId, patch);

        if (!updated) {
            throw new InvalidRunStateError(`Run "${runId}" was taken over by another owner.`);
        }

        this.ctx.emit({ type: 'run.updated', run: updated });

        return updated;
    }

    /**
     * What one execution of a remote agent's stand-in `run` gets from this
     * engine. Its signal aborts with the execution's stop as the reason
     * (`cancel`, `drain`, `lease-lost`), so the start can outlive a cancel.
     */
    remoteExecuteContext(run: Run, agent: RemoteAgent, signal: AbortSignal): RemoteExecuteContext {
        const { peers } = this.ctx;

        if (!peers) {
            throw new InvalidRunStateError(`Agent "${agent.name}" is a remote agent, but the engine has no peers.`);
        }

        const stopped = new AbortController();
        const forward = () => stopped.abort(this.ctx.executions.get(run.id)?.stop ?? 'cancel');

        if (signal.aborted) {
            forward();
        } else {
            signal.addEventListener('abort', forward, { once: true });
        }

        return {
            run,
            agent,
            peers,
            effectService: this.ctx.effectService,
            artifactService: this.ctx.artifactService,
            clock: this.ctx.clock,
            signal: stopped.signal,
            finish: (patch) => this.settleRun(run.id, patch),
            update: (patch) => this.executionUpdate(run.id, patch),
            pause: (request, usage) => this.ctx.pause(run, request, usage),
            onError: (error, failed) => this.ctx.onError(error, failed),
        };
    }

    /** A throwing execution fails the run (and releases its claim) instead of leaking. */
    guardedExecute(run: Run): Promise<void> {
        const { executions } = this.ctx;
        const controller = new AbortController();
        const { promise: done, resolve: release } = Promise.withResolvers<void>();
        const entry = { controller, done };

        executions.set(run.id, entry);

        return (async () => {
            try {
                await this.ctx.execute(run, controller.signal);
            } catch (error) {
                // the run belongs to another owner now: its failure is not ours to record
                if (executions.get(run.id)?.stop === 'lease-lost') {
                    return;
                }

                await this.settleRun(run.id, { status: RunStatus.FAILED, error: toRunError(error) });
                this.ctx.onError(error, run);
            } finally {
                // a later execution of the same run may hold the entry by now
                if (executions.get(run.id) === entry) {
                    executions.delete(run.id);
                }

                release();
            }
        })();
    }

    /**
     * Settles a `running` run this engine holds the claim of. A run aborted by
     * drain() is marked `interrupted` (claim released, not finished) instead of
     * `cancelled`; after a lost lease nothing is written and undefined resolves.
     */
    async settleRun(id: string, patch: Partial<Run>): Promise<Run | undefined> {
        // Another replica may repair a terminal owner immediately after this write.
        await this.ctx.conversations?.idle(id);

        const execution = this.ctx.executions.get(id);
        const stop = execution?.stop;

        if (stop === 'lease-lost') {
            return undefined;
        }

        const now = new Date(this.ctx.clock.now());
        const settled: Partial<Run> = stop === 'drain' && patch.status === RunStatus.CANCELLED ?
            {
                status: RunStatus.INTERRUPTED,
                usage: patch.usage,
                claim: undefined,
                updatedAt: now,
            } :
            {
                claim: undefined,
                // a run resumed after a crash may still carry its answered wait point
                waiting: undefined,
                finishedAt: now,
                updatedAt: now,
                // a registry cancel's reason; a remote one is already stored and kept
                ...(patch.status === RunStatus.CANCELLED && execution?.cancelReason && { error: execution.cancelReason }),
                // completed despite a cancel request: the stored reason no longer applies
                ...(patch.status === RunStatus.COMPLETED && { error: undefined }),
                ...patch,
            };

        if (settled.usage === undefined) {
            delete settled.usage;
        }

        const updated = await this.ownedUpdate(id, settled);

        if (updated) {
            this.ctx.emit({ type: 'run.updated', run: updated });
            await this.ctx.conversationOperations.reconcile(updated);
            this.ctx.remote?.cancelSettled(updated);
            this.ctx.peerReceiver?.onRunEvent(updated);
            await onRunSettled(this.ctx.dispatchContext(), updated);
        }

        return updated;
    }

    /**
     * Updates a `running` run only while this engine holds its claim. Resolves
     * undefined (and aborts the execution) when another owner took it over.
     */
    async ownedUpdate(id: string, patch: Partial<Run>): Promise<Run | undefined> {
        try {
            return await this.ctx.runService.update(id, patch, { expectStatus: [RunStatus.RUNNING], expectOwner: this.ctx.owner });
        } catch (error) {
            if (error instanceof InvalidRunStateError && !await this.ownsRun(id)) {
                return undefined;
            }

            throw error;
        }
    }

    /** Whether this engine still holds the run's claim; aborts its execution when not. */
    async ownsRun(id: string): Promise<boolean> {
        const run = await this.ctx.runService.findOne(id);

        if (run?.claim?.owner === this.ctx.owner) {
            return true;
        }

        this.loseLease(id);

        return false;
    }

    /**
     * Aborts the local execution of a run another owner may hold now; it writes
     * nothing more. Reported once per execution as a LeaseLostError.
     */
    loseLease(id: string): void {
        const execution = this.ctx.executions.get(id);

        if (!execution || execution.stop === 'lease-lost') {
            return;
        }

        execution.stop = 'lease-lost';
        execution.controller.abort();
        this.ctx.onError(new LeaseLostError(id));
    }

    /** Hands a claimed run back to `queued` (owner-guarded), emitted when the write landed. */
    protected async release(run: Run): Promise<void> {
        const released = await this.ownedUpdate(run.id, {
            status: RunStatus.QUEUED,
            claim: undefined,
            startedAt: undefined,
        });

        if (released) {
            this.ctx.emit({ type: 'run.updated', run: released });
        }
    }
}
