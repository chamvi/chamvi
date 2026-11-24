/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, ModelAgent, RemoteAgent } from '../../agent/types.ts';
import { assertAgentKind, assertRemoteAgent, conversationKey } from '../../agent/asserts.ts';
import { assertConcurrencyMaxRuns } from '../../channel/concurrency.ts';
import { assertDispatchRoles } from '../../dispatch/helpers/index.ts';
import { InvalidAgentDefinitionError } from '../../errors/index.ts';
import { assertAgentLimits } from '../../limit/asserts.ts';
import { checkAgentModel } from '../../model/module.ts';
import type { ModelContext } from '../../model/types.ts';
import { agentCancelReason } from './helpers.ts';
import {
    cancelAgentRuns,
    claimRevision,
    dropRevision,
    releaseRevision,
    syncRevision,
} from './module.ts';
import type {
    EngineRegistryContext,
    EngineRegistryState,
    IEngineRegistry,
    PutAgentOptions,
    RegistryContext,
} from './types.ts';

export class EngineRegistry implements IEngineRegistry {
    protected readonly ctx: EngineRegistryContext;

    readonly state: EngineRegistryState;

    /** The default, the resolver and the live agent models: what resolveModel(ctx) and IEngine.resolveModel() read. */
    readonly modelContext: ModelContext;

    constructor(ctx: EngineRegistryContext, agents: readonly Agent[]) {
        this.ctx = ctx;
        this.state = {
            agents: new Map(agents.map((a) => [a.name, a])),
            revisions: new Map(),
            formerRevisions: new Map(),
            replacing: new Map(),
            syncing: new Set(),
            removals: new Map(),
        };
        this.modelContext = {
            model: ctx.model,
            models: ctx.models,
            agentModel: (name) => this.state.agents.get(name)?.definition.model,
        };

        if (this.state.agents.size === agents.length) {
            return;
        }

        const seen = new Set<string>();
        const duplicate = agents.find((a) => seen.size === seen.add(a.name).size);
        throw new InvalidAgentDefinitionError(`Agent name "${duplicate?.name}" is used more than once.`);
    }

    getAgent(name: string): Agent | undefined {
        return this.state.agents.get(name);
    }

    listAgents(): Agent[] {
        return this.state.agents.values().toArray();
    }

    agentRevision(name: string): string | undefined {
        return this.state.revisions.get(name);
    }

    async putAgent(agent: Agent, options: PutAgentOptions = {}): Promise<'added' | 'replaced' | 'unchanged'> {
        const {
            agents,
            revisions,
            formerRevisions,
            syncing,
        } = this.state;

        this.assertRegistrable(agent);
        await this.ctx.engine.prepare({ agents: [agent], signal: options.signal });

        const preparationSignal = AbortSignal.any([this.ctx.preparationSignal(), ...(options.signal ? [options.signal] : [])]);

        preparationSignal.throwIfAborted();

        const { name } = agent;
        const {
            revision,
            formerRevision,
            reload = true,
        } = options;
        const registered = agents.has(name);

        if (registered && agents.get(name) === agent && revisions.get(name) === revision) {
            return 'unchanged';
        }

        // a replacement of a registered agent: checked dispatches for it are refused until it is published
        const release = registered ? this.markReplacing(name) : undefined;

        try {
            let cancelled: string[] | undefined;

            if (revision !== undefined) {
                syncing.add(name);

                try {
                    if (reload) {
                        cancelled = await syncRevision(this.registryContext(), name, revision, formerRevision);
                    } else {
                        await claimRevision(this.registryContext(), name, revision, formerRevision);
                    }
                } finally {
                    syncing.delete(name);
                }
            } else if (registered && reload) {
                cancelled = await cancelAgentRuns(this.registryContext(), name, agentCancelReason(name, 'replaced'), new Date(this.ctx.clock.now()));
            }

            if (cancelled) {
                this.ctx.emit({
                    type: 'agents.cancelled',
                    name,
                    reason: 'agent_replaced',
                    ...(revision !== undefined && { revision }),
                    runIds: cancelled,
                });
            }

            // Finish a registry operation already started, keeping its marker and local publication consistent.
            const kind = agents.has(name) ? 'replaced' : 'added';

            agents.set(name, agent);
            revisions.set(name, revision);

            if (formerRevision !== undefined) {
                formerRevisions.set(name, formerRevision);
            } else {
                formerRevisions.delete(name);
            }

            this.ctx.emit({
                type: 'agents.changed',
                name,
                kind,
            });

            return kind;
        } finally {
            release?.();
        }
    }

    async releaseRevision(name: string): Promise<string[] | undefined> {
        const {
            agents,
            revisions,
            replacing,
            syncing,
        } = this.state;

        // not while a putAgent of the name is in flight: it may publish a revision whose marker this would delete
        const eligible = () => agents.has(name) && revisions.get(name) === undefined &&
            !replacing.has(name) && !syncing.has(name);

        if (!eligible()) {
            return undefined;
        }

        const cancelled = await releaseRevision(this.registryContext(), name, eligible);

        if (cancelled) {
            this.ctx.emit({
                type: 'agents.cancelled',
                name,
                reason: 'agent_replaced',
                runIds: cancelled,
            });
        }

        return cancelled;
    }

    async removeAgent(name: string): Promise<boolean> {
        const release = this.markReplacing(name);

        try {
            return await this.dropAgent(name);
        } finally {
            release();
        }
    }

    /** removeAgent()'s body, while the name is marked as being replaced. */
    async dropAgent(name: string): Promise<boolean> {
        const {
            agents,
            revisions,
            formerRevisions,
            removals,
        } = this.state;
        const registered = agents.has(name);

        if (registered) {
            removals.set(name, revisions.get(name));
            agents.delete(name);
            revisions.delete(name);
            formerRevisions.delete(name);
            this.ctx.emit({
                type: 'agents.changed',
                name,
                kind: 'removed',
            });
        }

        const pending = removals.has(name);
        const cancelled = await dropRevision(this.registryContext(), name, {
            registered: pending,
            ...(pending && { revision: removals.get(name) }),
        });

        removals.delete(name);

        if (cancelled) {
            this.ctx.emit({
                type: 'agents.cancelled',
                name,
                reason: 'agent_removed',
                runIds: cancelled,
            });
        }

        return registered;
    }

    /** Marks `name` as being replaced or removed; the returned function clears this mark. */
    markReplacing(name: string): () => void {
        const { replacing } = this.state;

        replacing.set(name, (replacing.get(name) ?? 0) + 1);

        return () => {
            const count = (replacing.get(name) ?? 1) - 1;

            if (count > 0) {
                replacing.set(name, count);
            } else {
                replacing.delete(name);
            }
        };
    }

    checkAgent(agent: Agent): void {
        this.assertRegistrable(agent, { commit: false });
    }

    /**
     * Refuses an agent the engine cannot run: one whose kind is unknown or
     * disagrees with its definition, one subscribing to a channel it does not have,
     * or one with `limits` on an engine without a limit service.
     * `commit: false` (checkAgent()) keeps the skill check free of state changes.
     */
    assertRegistrable(agent: Agent, options: { commit?: boolean } = {}): void {
        // first: putAgent refuses before syncing, the lock and any store write
        assertAgentKind(agent);

        if (agent.kind === 'model') {
            checkAgentModel(agent, { model: this.ctx.model, models: this.ctx.models });
            this.assertLimits(agent);
        }

        if (agent.kind === 'remote') {
            this.assertRemoteAgent(agent);
        }

        assertConcurrencyMaxRuns(agent.definition.concurrencyMaxRuns, `Agent "${agent.name}" concurrencyMaxRuns`);

        for (const subscription of agent.definition.channels ?? []) {
            assertConcurrencyMaxRuns(subscription.concurrencyMaxRuns, `Agent "${agent.name}" subscription "${subscription.id}" concurrencyMaxRuns`);

            if (!this.ctx.getChannel(subscription.channel)) {
                throw new InvalidAgentDefinitionError(`Agent "${agent.name}" subscribes to unknown channel "${subscription.channel}".`);
            }
        }

        assertDispatchRoles(agent);

        if (conversationKey(agent.definition) !== undefined && !this.ctx.hasConversations) {
            throw new InvalidAgentDefinitionError('The agent enables conversations but the engine has no conversation capability.');
        }

        this.ctx.skills.checkAgent(agent, options);
    }

    /**
     * A model agent's `limits` pass defineModelAgent()'s check again (a
     * hand-built one skipped it), and non-empty ones need a limit service.
     */
    protected assertLimits(agent: ModelAgent): void {
        const { limits } = agent.definition;

        assertAgentLimits(limits);

        if (limits && Object.keys(limits).length > 0 && !this.ctx.limitService) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" declares limits but the engine has no limit service.`);
        }
    }

    /**
     * A remote agent passes defineRemoteAgent()'s checks again (a hand-built
     * one skipped them) with `agent`, `role` and `timeoutMs` set, its peer is
     * configured and its `approvals` channel registered with `out`.
     */
    assertRemoteAgent(agent: RemoteAgent): void {
        const { definition } = agent;

        assertRemoteAgent(definition);

        if (definition.agent === undefined || definition.role === undefined || definition.timeoutMs === undefined) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" needs agent, role and timeoutMs: build it with defineRemoteAgent().`);
        }

        const { peer, approvals } = definition;
        const { peers } = this.ctx;

        if (!peers) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" names unknown peer "${peer}": the engine has no peers (EngineOptions.peers).`);
        }

        if (!peers.has(peer)) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" names unknown peer "${peer}".`);
        }

        if (approvals && typeof this.ctx.getChannel(approvals.channel)?.out !== 'function') {
            throw new InvalidAgentDefinitionError(
                `Agent "${agent.name}": approvals channel "${approvals.channel}" is not registered or sends nothing (no out).`,
            );
        }
    }

    /** What the registry operations of `./module.ts` need from the engine. */
    registryContext(): RegistryContext {
        return {
            agentRevisionService: this.ctx.agentRevisionService,
            lockService: this.ctx.lockService,
            runService: this.ctx.runService,
            clock: this.ctx.clock,
            claimTtlMs: this.ctx.claimTtlMs,
            cancel: (runId, reason) => this.ctx.cancelRun(runId, reason),
            onError: (error, run) => this.ctx.onError(error, run),
        };
    }
}
