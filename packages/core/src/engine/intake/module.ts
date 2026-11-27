/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { randomUUID } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { RunStatus } from '@chamvi/core-kit';
import type {
    ConversationBinding,
    PeerStartInput,
    Run,
    TriggerEnvelope,
    TriggerParent,
} from '@chamvi/core-kit';
import { assertArtifactInput } from '../../artifact/helpers.ts';
import { storeArtifact } from '../../artifact/module.ts';
import type { DispatchResult } from '../../channel/types.ts';
import { createDispatchSerial } from '../../dispatch/helpers/index.ts';
import { dispatchPeer } from '../../dispatch/peer/module.ts';
import type { DispatchHost, PeerDispatchHost } from '../../dispatch/types.ts';
import {
    AgentNotFoundError,
    AgentReplacedError,
    InvalidRunStateError,
} from '../../errors/index.ts';
import { idempotencyScope, toInvoker } from '../../trigger/helpers.ts';
import { assertTriggerKey } from '../../trigger/key.ts';
import { IDEMPOTENCY_TTL_MS } from '../constants.ts';
import type { DispatchEngineContext } from '../dispatch/types.ts';
import type { DispatchEnvelope } from '../types.ts';
import type { EngineIntakeContext, IEngineIntake } from './types.ts';

export class EngineIntake implements IEngineIntake {
    protected readonly ctx: EngineIntakeContext;

    protected readonly peerDispatchHost: PeerDispatchHost;

    constructor(ctx: EngineIntakeContext) {
        this.ctx = ctx;
        this.peerDispatchHost = this.createPeerDispatchHost();
    }

    async dispatch(envelope: DispatchEnvelope): Promise<DispatchResult> {
        // a JS caller may pass a parent anyway: dropped, so nobody forges lineage
        const rest: DispatchEnvelope & { parent?: unknown; conversation?: unknown } = { ...envelope };

        delete rest.parent;
        delete rest.conversation;

        return this.ctx.createRun(rest);
    }

    async dispatchPeer(envelope: DispatchEnvelope, fields: PeerStartInput['peer'] & { role: string }): Promise<DispatchResult> {
        return dispatchPeer(this.peerDispatchHost, envelope, fields);
    }

    /**
     * dispatch()'s body; `parent` comes only from this argument (the
     * dispatch host or the peer host), never from the envelope, and so does
     * `taintSource` (a peer parent's initial taint, ignored for any other).
     */
    async createRun(
        envelope: DispatchEnvelope,
        parent?: TriggerParent,
        conversation?: ConversationBinding,
        taintSource?: string,
    ): Promise<DispatchResult> {
        // resolved once, synchronously: the agent and revision this run is created for
        const agent = this.ctx.getAgent(envelope.agent);
        const agentRevision = this.ctx.agentRevision(envelope.agent);
        const { checked } = envelope;

        if (!agent) {
            throw new AgentNotFoundError(envelope.agent);
        }

        // before the idempotency claim: a retry with the same key is safe
        if (checked !== undefined && (checked !== agent || this.ctx.isReplacing(envelope.agent))) {
            throw new AgentReplacedError(envelope.agent);
        }

        // Also strip forged fields from dispatch-host and internal envelope spreads.
        const safe: DispatchEnvelope & { conversation?: unknown; parent?: unknown } = { ...envelope };

        delete safe.conversation;
        delete safe.parent;
        delete safe.checked;

        const {
            attachments,
            invoker,
            ...rest
        } = safe as DispatchEnvelope;

        // before any store write: an invalid attachment stores nothing
        if (attachments !== undefined && !Array.isArray(attachments)) {
            throw new ValidationError('The attachments must be an array.');
        }

        attachments?.forEach((attachment, i) => {
            assertArtifactInput(attachment, `attachment ${i}`);

            if (attachment.key !== undefined) {
                throw new ValidationError('Attachments take no key.');
            }
        });
        assertTriggerKey('idempotency key', envelope.idempotencyKey);
        assertTriggerKey('concurrency key', envelope.concurrencyKey);
        assertTriggerKey('address', envelope.address);

        const snapshot = invoker !== undefined ? toInvoker(invoker) : undefined;
        const now = this.ctx.nextCreatedAt();
        const trigger: TriggerEnvelope = {
            ...rest,
            ...(snapshot ? { invoker: snapshot } : {}),
            ...(parent ? {
                parent: {
                    ...parent,
                    ...(parent.kind === 'dispatch' && parent.source ? { source: { ...parent.source } } : {}),
                },
            } : {}),
            id: envelope.id ?? randomUUID(),
            receivedAt: envelope.receivedAt ?? now,
        };
        let runId: string = uuidv7();

        if (trigger.idempotencyKey !== undefined) {
            const claimed = await this.ctx.idempotencyService.claim(
                idempotencyScope(conversation ? {
                    ...trigger,
                    agent: conversation.scope.identity.agent,
                    channel: `${trigger.channel}:conversation:${conversation.scope.id}`,
                } : trigger),
                trigger.idempotencyKey,
                runId,
                IDEMPOTENCY_TTL_MS,
            );

            if (!claimed.created) {
                const original = await this.ctx.runService.findOne(claimed.runId);

                if (original) {
                    if (conversation && original.conversation?.scope.id !== conversation.scope.id) {
                        throw new ValidationError('The duplicate run belongs to another conversation.');
                    }

                    return { runId: claimed.runId, deduplicated: true };
                }

                // shortcut: post-reset reservations cannot heal, persist generations when automatic recovery is required.
                if (conversation && conversation.scope.generation > 0) {
                    throw new InvalidRunStateError('The reserved conversation run is missing and its original generation cannot be proven after reset.');
                }

                // the key's run was never created (createRun failed after the claim, or is
                // still in flight): create it under the reserved id; createRun decides the race
                runId = claimed.runId;
            }
        }

        if (attachments?.length) {
            // stored before the run, so an executing run finds them; a crash in between leaves orphans.
            // Keyed by index: a concurrent healer of the same run loses each key and names the stored artifact.
            trigger.attachments = [];

            for (const [i, attachment] of attachments.entries()) {
                trigger.attachments.push(await storeArtifact(
                    this.ctx.artifactService,
                    { id: runId, agent: trigger.agent },
                    attachment,
                    now,
                    `attachment:${i}`,
                ));
            }
        }

        const run: Run = {
            id: runId,
            agent: trigger.agent,
            status: RunStatus.QUEUED,
            // a dispatched run inherits its parent's taint; a peer parent's runId names a run of the peer
            taint: (parent?.kind === 'dispatch' ? (await this.ctx.runService.findOne(parent.runId))?.taint : undefined) ??
                (parent?.kind === 'peer' && taintSource !== undefined ? { at: now, source: taintSource } : undefined) ??
                (this.ctx.getChannel(trigger.channel)?.untrusted ? { at: now, source: `channel:${trigger.channel}` } : undefined),
            trigger,
            concurrencyKey: trigger.concurrencyKey,
            address: trigger.address,
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: now,
            updatedAt: now,
        };

        // a checked dispatch binds the run to the revision its check saw; unchecked runs follow the registry
        if (checked !== undefined && agentRevision !== undefined) {
            run.agentRevision = agentRevision;
        }

        if (conversation) {
            run.conversation = structuredClone(conversation);
        }

        if (!await this.ctx.runService.create(run)) {
            return { runId, deduplicated: true };
        }

        this.ctx.emit({ type: 'run.updated', run });

        if (checked !== undefined) {
            this.ctx.checkedRuns.set(run.id, checked);
        }

        // replaced while the run was created: no startable run of the old check is left
        if (checked !== undefined && (this.ctx.getAgent(run.agent) !== checked || this.ctx.isReplacing(run.agent))) {
            await this.ctx.cancelReplaced(run.id, run.agent);
        }

        if (this.ctx.isStarted()) {
            void this.ctx.pump();
        }

        return { runId, deduplicated: false };
    }

    /**
     * The internal host dispatch() reaches through inject(): the only
     * path that sets a run's parent.
     */
    createDispatchHost(): DispatchHost {
        return {
            getAgent: (name) => this.ctx.getAgent(name),
            hasChannel: (name) => this.ctx.getChannel(name) !== undefined,
            clock: this.ctx.clock,
            effects: this.ctx.effectService,
            runs: this.ctx.runService,
            // a backstop for a parent that settled or paused after dispatch() checked its frame: read
            // before createRun, so a refused child skips the idempotency claim (a read, not a guarded write)
            createRun: async (envelope, parent) => {
                const stored = await this.ctx.runService.findOne(parent.runId);

                if (stored?.status !== RunStatus.RUNNING) {
                    throw new InvalidRunStateError(`Run "${parent.runId}" is not running: it cannot dispatch a run.`);
                }

                return this.ctx.createRun(envelope, parent);
            },
            serial: createDispatchSerial(),
            inflight: new Map(),
        };
    }

    /**
     * The internal host of dispatchPeer(): the only path that sets a peer
     * parent or an initial peer taint.
     */
    createPeerDispatchHost(): PeerDispatchHost {
        return {
            getAgent: (name) => this.ctx.getAgent(name),
            clock: this.ctx.clock,
            effects: this.ctx.effectService,
            peers: this.ctx.peers,
            locks: this.ctx.lockService,
            lockTtlMs: this.ctx.claimTtlMs,
            createRun: (envelope, parent, taintSource) => this.ctx.createRun(envelope, parent, undefined, taintSource),
            serial: createDispatchSerial(),
        };
    }

    /** What the dispatch-wait operations need from the engine. */
    dispatchContext(): DispatchEngineContext {
        return {
            runService: this.ctx.runService,
            clock: this.ctx.clock,
            claimTtlMs: this.ctx.claimTtlMs,
            resume: this.ctx.resume,
            cancel: this.ctx.cancel,
            onError: (error, run) => this.ctx.onError(error, run),
            emit: (run) => this.ctx.emit({ type: 'run.updated', run }),
        };
    }
}
