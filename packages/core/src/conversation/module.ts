/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { isObject } from 'smob';
import { RunStatus } from '@chamvi/core-kit';
import type { 
    ConversationIdentity, 
    ConversationScope, 
    Invoker, 
    Run, 
} from '@chamvi/core-kit';
import type {
    ConversationInspection,
    ConversationOperationLiteral,
    ConversationOptions,
    IConversationService,
    IConversations,
    ResolvedConversationLimits,
} from './types.ts';
import type { IEffectService } from '../effect/types.ts';
import type { IRunService } from '../run/types.ts';
import { InvalidAgentDefinitionError, InvalidRunStateError } from '../errors/index.ts';
import { ConversationOperation, ConversationTurnKind } from './constants.ts';
import { matchesEmitReceipt, normalizeConversationLimits } from './helpers.ts';
import { assertPage } from './persistence/module.ts';

function settled(run: Run | undefined): boolean {
    return !run || run.status === RunStatus.COMPLETED || run.status === RunStatus.FAILED || run.status === RunStatus.CANCELLED;
}

/** Optional engine capability; no ordinary run calls it. */
export class Conversations implements IConversations {
    readonly service: IConversationService;

    readonly limits: ResolvedConversationLimits;

    protected readonly authorize;

    protected readonly pending = new Map<string, Set<Promise<void>>>();

    protected readonly runs: Pick<IRunService, 'findOne'>;

    protected readonly effects: Pick<IEffectService, 'findOne'>;

    constructor(options: ConversationOptions, service: IConversationService, runs: Pick<IRunService, 'findOne'>, effects: Pick<IEffectService, 'findOne'>) {
        if (!isObject(options) || typeof options.authorize !== 'function' || !isObject(service)) {
            throw new InvalidAgentDefinitionError('Conversations need a conversation service and an authorizer.');
        }

        this.service = service;
        this.runs = runs;
        this.effects = effects;
        this.authorize = options.authorize;
        this.limits = normalizeConversationLimits(options.limits);
    }

    async allow(operation: ConversationOperationLiteral, identity: ConversationIdentity, agent: string, invoker?: Invoker): Promise<void> {
        const authorized = await this.authorize(structuredClone({
            operation,
            identity,
            agent,
            ...(invoker ? { invoker } : {}),
        }));

        if (!authorized) {
            throw new ValidationError('Conversation access was denied.');
        }
    }

    async check(run: Run, operation: `${ConversationOperation.RECALL | ConversationOperation.NOTES}` = ConversationOperation.RECALL): Promise<void> {
        const { scope } = run.conversation!;

        await this.allow(operation, scope.identity, run.trigger.agent, run.trigger.invoker);

        const current = await this.service.findOne(scope.identity);

        if (!current || current.id !== scope.id || current.generation !== scope.generation) {
            throw new InvalidRunStateError('The conversation scope is stale: it was reset or deleted.');
        }
    }

    async admit(run: Run) {
        await this.check(run);

        const { scope, text } = run.conversation!;
        let result = await this.service.beginTurn(scope, run.id, text, this.limits);

        if (result.kind === ConversationTurnKind.BUSY && settled(await this.runs.findOne(result.runId))) {
            await this.reconcile(scope, result.runId);
            result = await this.service.beginTurn(scope, run.id, text, this.limits);
        }

        if (result.kind === ConversationTurnKind.STALE) {
            throw new InvalidRunStateError('The conversation scope is stale: it was reset or deleted.');
        }

        return result;
    }

    track(runId: string, work: Promise<void>): Promise<void> {
        const pending = this.pending.get(runId) ?? new Set<Promise<void>>();

        this.pending.set(runId, pending);
        pending.add(work);

        const remove = () => {
            pending.delete(work);

            if (pending.size === 0 && this.pending.get(runId) === pending) {
                this.pending.delete(runId);
            }
        };

        void work.then(remove, remove);

        return work;
    }

    async idle(runId?: string): Promise<void> {
        for (;;) {
            const pending = runId === undefined ?
                this.pending.values().toArray().flatMap((entries) => Array.from(entries)) :
                Array.from(this.pending.get(runId) ?? []);

            if (pending.length === 0) {
                return;
            }

            await Promise.allSettled(pending);
        }
    }

    async reconcile(scope: ConversationScope, runId: string): Promise<void> {
        // Terminal repair never fabricates success for an unrecorded external send.
        await this.idle(runId);
        await this.track(runId, (async () => {
            const pending = await this.service.pendingEmits(scope, runId);
            const confirmed: string[] = [];

            for (const item of pending) {
                const effect = item.effectKey ? await this.effects.findOne(item.effectKey) : undefined;

                if (effect && matchesEmitReceipt(effect.result, item.target)) {
                    confirmed.push(item.id);
                }
            }

            await this.service.endTurn(scope, runId, confirmed);
        })());
    }

    async repair(identity: ConversationIdentity): Promise<void> {
        const scope = await this.service.findOne(identity);

        if (!scope) {
            return;
        }

        const owner = await this.service.activeRun(scope);

        if (owner && settled(await this.runs.findOne(owner))) {
            await this.reconcile(scope, owner);
        }
    }

    async inspect(identity: ConversationIdentity, query: { limit?: number; offset?: number } = {}): Promise<ConversationInspection | undefined> {
        const page = { limit: query.limit ?? 50, offset: query.offset ?? 0 };

        assertPage(page);

        if (page.limit > 100) {
            throw new ValidationError('Conversation inspection limit must be at most 100.');
        }

        const scope = await this.service.findOne(identity);

        if (!scope) {
            return undefined;
        }

        const [items, notes] = await Promise.all([this.service.findItems(scope, page), this.service.findNotes(scope, page)]);

        return {
            scope,
            items,
            notes,
        };
    }

    async prune(): Promise<void> {
        await this.service.prune(this.limits, { isSettled: async (id) => settled(await this.runs.findOne(id)) });
    }
}
