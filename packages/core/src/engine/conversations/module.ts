/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConversationIdentity, ConversationScope, Run } from '@chamvi/store';
import { conversationKey } from '../../agent/asserts.ts';
import type {
    ChannelContext,
    ChannelDispatchEnvelope,
    DispatchResult,
    IChannel,
} from '../../channel/types.ts';
import { ConversationOperation } from '../../conversation/constants.ts';
import { conversationConcurrencyKey } from '../../conversation/helpers.ts';
import {
    assertConversationIdentity,
    assertConversationText,
    identityId,
} from '../../conversation/persistence/module.ts';
import type {
    ConversationInspection,
    ConversationTarget,
    IConversations,
} from '../../conversation/types.ts';
import { ValidationError } from '../../errors/index.ts';
import { toInvoker } from '../../trigger/helpers.ts';
import { assertTriggerKey } from '../../trigger/key.ts';
import type { EngineConversationsContext, IEngineConversations } from './types.ts';

export class EngineConversations implements IEngineConversations {
    protected readonly ctx: EngineConversationsContext;

    constructor(ctx: EngineConversationsContext) {
        this.ctx = ctx;
    }

    capability(): IConversations {
        if (!this.ctx.conversations) {
            throw new ValidationError('Conversation capability is disabled.');
        }

        return this.ctx.conversations;
    }

    inspect(identity: ConversationIdentity, query?: { limit?: number; offset?: number }): Promise<ConversationInspection | undefined> {
        return this.capability().inspect(structuredClone(identity), query);
    }

    async reset(identity: ConversationIdentity, options: { keepNotes?: boolean } = {}): Promise<ConversationScope> {
        const capability = this.capability();
        const copied = structuredClone(identity);

        await capability.repair(copied);

        return capability.service.reset(copied, { keepNotes: options.keepNotes ?? false });
    }

    async delete(identity: ConversationIdentity): Promise<void> {
        const capability = this.capability();
        const copied = structuredClone(identity);

        await capability.repair(copied);
        await capability.service.delete(copied);
    }

    prune(): Promise<void> {
        return this.capability().prune();
    }

    /** Gives a transport a context for the exact registered channel object. */
    channelContext(channel: IChannel): ChannelContext {
        if (this.ctx.getChannel(channel.name) !== channel) {
            throw new ValidationError('The channel object is not registered.');
        }

        return {
            engine: this.ctx.engine,
            dispatch: (envelope) => this.ctx.dispatch({ ...envelope, channel: channel.name }),
            dispatchConversation: (envelope, target) => this.intake(channel, envelope, target),
        };
    }

    /** Trusted intake belongs to the engine and is bound to the registered channel object. */
    async intake(channel: IChannel, envelope: ChannelDispatchEnvelope, target: ConversationTarget): Promise<DispatchResult> {
        if (this.ctx.getChannel(channel.name) !== channel) {
            throw new ValidationError('Conversation intake needs the registered channel object.');
        }

        const capability = this.capability();
        const copied = structuredClone(target);
        const input = structuredClone(envelope);
        const agent = this.ctx.getAgent(input.agent);
        const key = agent && conversationKey(agent.definition);

        if (key === undefined) {
            throw new ValidationError('The agent has not enabled conversations.');
        }

        const identity: ConversationIdentity = {
            agent: key,
            channel: channel.name,
            account: copied?.account,
            chat: copied?.chat,
            audience: copied?.audience,
        };

        assertConversationIdentity(identity);
        assertConversationText(copied?.text, capability.limits.maxItemBytes);

        for (const field of ['id', 'idempotencyKey', 'concurrencyKey', 'address'] as const) {
            if (input[field] !== undefined) {
                assertConversationText(input[field], Number.MAX_SAFE_INTEGER);
            }
        }

        const invoker = input.invoker === undefined ? undefined : toInvoker(input.invoker);

        await capability.allow(ConversationOperation.DISPATCH, identity, input.agent, invoker);

        // Validate caller keys before resolve can create any conversation rows.
        assertTriggerKey('idempotency key', input.idempotencyKey);
        assertTriggerKey('concurrency key', input.concurrencyKey);

        const current = await capability.service.findOne(identity);
        const proposed = current ?? {
            id: identityId(identity),
            generation: 0,
            identity,
        };

        if (input.concurrencyKey !== undefined && input.concurrencyKey !== conversationConcurrencyKey(proposed)) {
            throw new ValidationError('The conversation concurrency key conflicts with its scope.');
        }

        const scope = await capability.service.resolve(identity);
        const concurrencyKey = conversationConcurrencyKey(scope);

        if (input.concurrencyKey !== undefined && input.concurrencyKey !== concurrencyKey) {
            throw new ValidationError('The conversation concurrency key conflicts with its scope.');
        }

        return this.ctx.createRun({
            ...input,
            channel: channel.name,
            concurrencyKey,
        }, undefined, { scope, text: copied.text });
    }

    /** Reconciles a settled run's conversation, then lets deferred runs try again. */
    async reconcile(run: Run): Promise<void> {
        if (!run.conversation || !['completed', 'failed', 'cancelled'].includes(run.status)) {
            return;
        }

        try {
            await this.capability().reconcile(run.conversation.scope, run.id);
            this.ctx.retryDeferred();

            if (this.ctx.isStarted()) {
                void this.ctx.pump();
            }
        } catch (error) {
            this.ctx.onError(error, run);
        }
    }
}
