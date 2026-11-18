/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    and,
    defineQuery,
    eq,
    gt,
    lt,
    lte,
    ne,
} from '@rapiq/core';
import type { ICondition } from '@rapiq/core';
import { isObject } from 'smob';
import { uuidv7 } from 'uuidv7';
import { CONVERSATION_ITEM_STORED_ORDER, EntityConflictError, EntityRelationError } from '@chamvi/store';
import type {
    ConversationIdentity,
    ConversationItem,
    ConversationItemRecord,
    ConversationNote,
    ConversationNoteOperation,
    ConversationOperationRecord,
    ConversationRecord,
    ConversationScope,
    ConversationSnapshot,
    IConversationRepository,
} from '@chamvi/store';
import type { IClock } from '../clock/index.ts';
import {
    InvalidRunStateError,
    RepositoryNotFoundError,
    RunNotFoundError,
    ValidationError,
} from '../errors/index.ts';
import { CONVERSATION_LIMITS_MAX, CONVERSATION_NOTES_MAX } from './constants.ts';
import {
    compareNotes,
    isNoteActive,
    readItem,
    readNote,
    readScope,
    resultOf,
} from './helpers.ts';
import {
    assertConversationScope,
    assertConversationText,
    assertEmitItem,
    assertNoteOperationContent,
    assertNoteOperationShape,
    assertPage,
    assertRunId,
    buildSnapshotContent,
    identityId,
    isSameEmit,
    itemBytes,
    selectRecent,
    userItemId,
} from './persistence/module.ts';
import type { 
    BeginTurnResult, 
    ConversationFindOptions, 
    ConversationNoteResult, 
    ConversationServiceContext, 
    IConversationService, 
    ResolvedConversationLimits, 
} from './types.ts';

/**
 * Item sizes (ids and byte lengths, no text) the first recall page reads,
 * newest first: a short transcript or a budget used by recent items needs
 * no more.
 */
const RECALL_FIRST_PAGE = 100;

/** Item sizes every later recall page reads: a generation holds at most about this many items. */
const RECALL_PAGE = CONVERSATION_LIMITS_MAX.maxStoredItems;

/** Rows a trim or a prune reads per page before it removes them. */
const TRIM_PAGE = 100;

function staleError(): InvalidRunStateError {
    return new InvalidRunStateError('The conversation scope is stale: it was reset or deleted.');
}

function ownerError(): InvalidRunStateError {
    return new InvalidRunStateError('The run does not hold the conversation turn.');
}

/**
 * Conversations, their transcripts, notes and note operations over an
 * `IConversationRepository`, with every conversation rule in one place:
 * stale scopes, one active turn per scope generation, the turn's frozen
 * snapshot, emit preparation and confirmation, note limits and replays,
 * reset and delete, retention and trimming, and the history recall.
 *
 * A change runs in one transaction: the conversation row read locked
 * first, then the clock, then the writes through the handed-in repository
 * and its `items`, `notes` and `operations`. Multi-row child writes use
 * the port's batched operations. Values are copied in and out, every date
 * and expiry comes from the clock, and no refusal carries stored content.
 */
export class ConversationService implements IConversationService {
    protected repository: IConversationRepository;

    protected clock: IClock;

    constructor(ctx: ConversationServiceContext) {
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async resolve(identity: ConversationIdentity): Promise<ConversationScope> {
        const key = identityId(identity);
        const existing = await this.repository.findOneBy({ key });

        if (existing) {
            return readScope(existing);
        }

        try {
            const created = await this.repository.transaction((repository) => repository.save(repository.create({
                id: uuidv7(),
                key,
                identity: {
                    agent: identity.agent,
                    channel: identity.channel,
                    account: identity.account,
                    chat: identity.chat,
                    audience: identity.audience,
                },
                generation: 0,
            })));

            return readScope(created);
        } catch (error) {
            if (!(error instanceof EntityConflictError)) {
                throw error;
            }
        }

        // created concurrently: the stored row wins
        const stored = await this.repository.findOneBy({ key });

        if (!stored) {
            throw new RepositoryNotFoundError('conversations');
        }

        return readScope(stored);
    }

    async findOne(identity: ConversationIdentity): Promise<ConversationScope | undefined> {
        const record = await this.repository.findOneBy({ key: identityId(identity) });

        return record ? readScope(record) : undefined;
    }

    async findOneOrFail(identity: ConversationIdentity): Promise<ConversationScope> {
        const result = await this.findOne(identity);

        if (result === undefined) {
            throw new RepositoryNotFoundError('conversations');
        }

        return result;
    }

    async activeRun(scope: ConversationScope): Promise<string | undefined> {
        assertConversationScope(scope);

        const record = await this.repository.findOneById(scope.id);

        return record?.generation === scope.generation ? record.activeRunId : undefined;
    }

    async beginTurn(
        scope: ConversationScope,
        runId: string,
        text: string,
        limits: ResolvedConversationLimits,
    ): Promise<BeginTurnResult> {
        assertConversationScope(scope);
        assertRunId(runId);
        assertConversationText(text, CONVERSATION_LIMITS_MAX.maxItemBytes);

        try {
            return await this.repository.transaction(async (repository) => {
                const record = await repository.findOneById(scope.id);

                if (!record || record.generation !== scope.generation) {
                    return { kind: 'stale' };
                }

                if (record.activeRunId === runId && record.snapshot) {
                    return { kind: 'ready', snapshot: this.snapshotOf(record, runId) };
                }

                assertConversationText(text, limits.maxItemBytes);

                if (record.activeRunId !== undefined && record.activeRunId !== runId) {
                    return { kind: 'busy', runId: record.activeRunId };
                }

                const where = { scopeId: record.id, generation: record.generation };

                if (await repository.items.findOneBy({ ...where, key: userItemId(runId) })) {
                    throw new InvalidRunStateError('The conversation turn has already ended.');
                }

                const now = this.clock.now();

                await this.trimExpired(repository, record.id, runId, limits, now);
                await this.dropExpiredNotes(repository, record.id, now);

                const content = await this.recall(repository, record, limits, now);

                await repository.items.save(this.createItem(repository, {
                    ...where,
                    key: userItemId(runId),
                    role: 'user',
                    text,
                    runId,
                    createdAt: now,
                    status: 'sent',
                }));

                const saved = await repository.save(repository.merge(record, {
                    activeRunId: runId,
                    snapshot: { ...content, createdAt: now },
                }));

                await this.trimCount(repository, record.id, record.generation, runId, limits.maxStoredItems);

                return { kind: 'ready', snapshot: this.snapshotOf(saved, runId) };
            });
        } catch (error) {
            if (error instanceof EntityRelationError && error.relation === 'run') {
                throw new RunNotFoundError(runId);
            }

            throw error;
        }
    }

    async endTurn(scope: ConversationScope, runId: string, confirmedEmitIds: string[]): Promise<void> {
        assertConversationScope(scope);
        assertRunId(runId);

        const valid = Array.isArray(confirmedEmitIds) && confirmedEmitIds.every((id) => typeof id === 'string');

        if (!valid) {
            throw new ValidationError('The confirmed emit ids must be an array of strings.');
        }

        const confirmed = new Set(confirmedEmitIds);

        await this.repository.transaction(async (repository) => {
            const record = await repository.findOneById(scope.id);

            // only the owner of the current generation ends its turn; anything else is a no-op
            if (!record || record.generation !== scope.generation || record.activeRunId !== runId) {
                return;
            }

            const pending = await repository.items.findManyBy({
                scopeId: record.id,
                generation: record.generation,
                runId,
                status: 'pending',
            });

            if (pending.length > 0) {
                await repository.items.upsertMany(pending.map((item) => ({
                    ...item,
                    status: confirmed.has(item.key) ? 'sent' : 'unknown',
                })));
            }

            await repository.save(repository.merge(record, { activeRunId: undefined, snapshot: undefined }));
        });
    }

    async prepareEmit(scope: ConversationScope, item: ConversationItem): Promise<void> {
        assertConversationScope(scope);

        await this.repository.transaction(async (repository) => {
            const record = this.current(scope, await repository.findOneById(scope.id));

            if (!isObject(item) || record.activeRunId === undefined || item.runId !== record.activeRunId) {
                throw ownerError();
            }

            assertEmitItem(item);

            const where = { scopeId: record.id, generation: record.generation };
            const stored = await repository.items.findOneBy({ ...where, key: item.id });

            if (stored) {
                if (!isSameEmit(readItem(stored), item)) {
                    throw new ValidationError('A conversation item of this id exists with other content.');
                }

                return;
            }

            const value: Omit<ConversationItemRecord, 'id' | 'bytes'> = {
                ...where,
                key: item.id,
                role: 'assistant',
                text: item.text,
                runId: item.runId,
                createdAt: this.clock.now(),
                status: 'pending',
            };

            if (item.effectKey !== undefined) {
                value.effectKey = item.effectKey;
            }

            if (item.target !== undefined) {
                value.target = { channel: item.target.channel, address: item.target.address };
            }

            await repository.items.save(this.createItem(repository, value));
        });
    }

    async confirmEmit(scope: ConversationScope, itemId: string): Promise<void> {
        assertConversationScope(scope);

        await this.repository.transaction(async (repository) => {
            const record = this.current(scope, await repository.findOneById(scope.id));
            const item = typeof itemId === 'string' ?
                await repository.items.findOneBy({
                    scopeId: record.id,
                    generation: record.generation,
                    key: itemId,
                }) :
                null;

            if (!item || record.activeRunId === undefined || item.runId !== record.activeRunId) {
                throw ownerError();
            }

            if (item.status === 'pending') {
                await repository.items.save(repository.items.merge(item, { status: 'sent' }));
            }
        });
    }

    async pendingEmits(scope: ConversationScope, runId: string): Promise<ConversationItem[]> {
        assertConversationScope(scope);
        assertRunId(runId);

        const { data } = await this.repository.items.findMany(defineQuery({
            filters: and(
                eq('scopeId', scope.id),
                eq('generation', scope.generation),
                eq('runId', runId),
                eq('status', 'pending'),
            ),
            sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'ASC' },
        }));

        return data.map((item) => readItem(item));
    }

    async findItems(scope: ConversationScope, query: ConversationFindOptions): Promise<{ data: ConversationItem[]; total: number }> {
        assertConversationScope(scope);
        assertPage(query);

        const { data, meta } = await this.repository.items.findMany(defineQuery({
            filters: and(eq('scopeId', scope.id), eq('generation', scope.generation)),
            sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'ASC' },
            pagination: { limit: query.limit, offset: query.offset },
        }));

        return { data: data.map((item) => readItem(item)), total: meta.total };
    }

    async findItemsOrFail(scope: ConversationScope, query: ConversationFindOptions): Promise<{ data: ConversationItem[]; total: number }> {
        const result = await this.findItems(scope, query);

        if (result.data.length === 0) {
            throw new RepositoryNotFoundError('conversation items');
        }

        return result;
    }

    async findNotes(scope: ConversationScope, query: ConversationFindOptions): Promise<{ data: ConversationNote[]; total: number }> {
        assertConversationScope(scope);
        assertPage(query);

        const notes = await this.liveNotes(scope);

        return { data: notes.slice(query.offset, query.offset + query.limit), total: notes.length };
    }

    async findNotesOrFail(scope: ConversationScope, query: ConversationFindOptions): Promise<{ data: ConversationNote[]; total: number }> {
        const result = await this.findNotes(scope, query);

        if (result.data.length === 0) {
            throw new RepositoryNotFoundError('conversation notes');
        }

        return result;
    }

    async findOneNote(scope: ConversationScope, key: string): Promise<ConversationNote | undefined> {
        assertConversationScope(scope);

        if (typeof key !== 'string') {
            return undefined;
        }

        const record = await this.repository.findOneById(scope.id);

        if (!record || record.generation !== scope.generation) {
            return undefined;
        }

        const note = await this.repository.notes.findOneBy({
            scopeId: record.id,
            generation: record.generation,
            key,
        });

        return note && isNoteActive(note, this.clock.now()) ? readNote(note) : undefined;
    }

    async findOneNoteOrFail(scope: ConversationScope, key: string): Promise<ConversationNote> {
        const result = await this.findOneNote(scope, key);

        if (result === undefined) {
            throw new RepositoryNotFoundError('conversation notes');
        }

        return result;
    }

    async applyNote(scope: ConversationScope, operation: ConversationNoteOperation): Promise<ConversationNoteResult> {
        assertConversationScope(scope);

        return this.repository.transaction(async (repository) => {
            const record = this.current(scope, await repository.findOneById(scope.id));
            const runId = isObject(operation) && isObject(operation.source) ? operation.source.runId : undefined;

            // ownership before any write or replay
            if (record.activeRunId === undefined || runId !== record.activeRunId) {
                throw ownerError();
            }

            assertNoteOperationShape(operation);

            const where = { scopeId: record.id, generation: record.generation };
            const recorded = await repository.operations.findOneBy({ ...where, operationId: operation.id });

            if (recorded) {
                if (recorded.inputHash !== operation.inputHash || recorded.runId !== operation.source.runId) {
                    throw new ValidationError('The note operation was already applied with another input.');
                }

                return resultOf(recorded);
            }

            const now = this.clock.now();

            assertNoteOperationContent(operation, now);
            await this.dropExpiredNotes(repository, record.id, now);

            const prior = await repository.notes.findOneBy({ ...where, key: operation.key });
            let result: ConversationNoteResult;

            if (operation.kind === 'set') {
                if (!prior && (await repository.notes.findManyBy(where)).length >= CONVERSATION_NOTES_MAX) {
                    throw new ValidationError(`A conversation holds at most ${CONVERSATION_NOTES_MAX} notes.`);
                }

                const values = {
                    text: operation.text,
                    updatedAt: now,
                    source: {
                        runId: operation.source.runId,
                        toolCallId: operation.source.toolCallId,
                        stepIndex: operation.source.stepIndex,
                    },
                    expiresAt: operation.expiresAt === undefined ? undefined : new Date(operation.expiresAt.getTime()),
                };

                await repository.notes.save(prior ?
                    repository.notes.merge(prior, values) :
                    repository.notes.create({
                        id: uuidv7(),
                        ...where,
                        key: operation.key,
                        createdAt: now,
                        ...values,
                    }));

                result = {
                    kind: 'set',
                    key: operation.key,
                    updatedAt: now,
                };
            } else {
                if (prior) {
                    await repository.notes.remove(prior);
                }

                result = {
                    kind: 'remove',
                    key: operation.key,
                    removed: prior !== null,
                };
            }

            const stored: ConversationOperationRecord = {
                id: uuidv7(),
                ...where,
                operationId: operation.id,
                runId: operation.source.runId,
                inputHash: operation.inputHash,
                kind: result.kind,
                key: result.key,
                createdAt: now,
            };

            if (result.kind === 'remove') {
                stored.removed = result.removed;
            }

            await repository.operations.save(repository.operations.create(stored));

            return result;
        });
    }

    async reset(identity: ConversationIdentity, options: { keepNotes: boolean }): Promise<ConversationScope> {
        if (!isObject(options) || typeof options.keepNotes !== 'boolean') {
            throw new ValidationError('The reset options need keepNotes as a boolean.');
        }

        const scope = await this.resolve(identity);

        return this.repository.transaction(async (repository) => {
            const record = await repository.findOneById(scope.id);

            if (!record || record.activeRunId !== undefined) {
                throw new InvalidRunStateError('The conversation has an active turn and cannot be reset.');
            }

            const now = this.clock.now();
            const generation = record.generation + 1;
            const saved = await repository.save(repository.merge(record, {
                generation,
                activeRunId: undefined,
                snapshot: undefined,
            }));

            if (options.keepNotes) {
                // at most CONVERSATION_NOTES_MAX live notes and those expired since the last write
                const notes = await repository.notes.findManyBy({ scopeId: record.id });
                const expired = notes.filter((note) => !isNoteActive(note, now));
                const live = notes.filter((note) => isNoteActive(note, now));

                if (expired.length > 0) {
                    await repository.notes.removeManyBy({ id: expired.map((note) => note.id) });
                }

                if (live.length > 0) {
                    await repository.notes.upsertMany(live.map((note) => ({ ...note, generation })));
                }
            } else {
                await repository.notes.removeManyBy({ scopeId: record.id });
                await repository.operations.removeManyBy({ scopeId: record.id });
            }

            return readScope(saved);
        });
    }

    async delete(identity: ConversationIdentity): Promise<void> {
        const key = identityId(identity);

        await this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ key });

            if (!record) {
                return;
            }

            if (record.activeRunId !== undefined) {
                throw new InvalidRunStateError('The conversation has an active turn and cannot be deleted.');
            }

            await repository.save(repository.merge(record, {
                generation: record.generation + 1,
                activeRunId: undefined,
                snapshot: undefined,
            }));
            await repository.items.removeManyBy({ scopeId: record.id });
            await repository.notes.removeManyBy({ scopeId: record.id });
            await repository.operations.removeManyBy({ scopeId: record.id });
        });
    }

    async prune(
        limits: ResolvedConversationLimits,
        options: { isSettled?: (runId: string) => Promise<boolean> } = {},
    ): Promise<void> {
        const { isSettled } = options;
        const settled = new Map<string, boolean>();
        let failure: { error: unknown } | undefined;
        let after: string | undefined;

        for (;;) {
            const { data: page } = await this.repository.findMany(defineQuery({
                ...(after === undefined ? {} : { filters: gt('id', after) }),
                sorts: { id: 'ASC' },
                pagination: { limit: TRIM_PAGE },
            }));

            if (page.length === 0) {
                break;
            }

            for (const conversation of page) {
                await this.trimConversation(conversation.id, limits);

                if (isSettled) {
                    const error = await this.pruneOperations(conversation.id, limits, isSettled, settled);

                    failure ??= error;
                }
            }

            after = page[page.length - 1]!.id;
        }

        if (failure) {
            throw failure.error;
        }
    }

    /** The trims of prune on one conversation, under its row lock. */
    protected async trimConversation(id: string, limits: ResolvedConversationLimits): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await repository.findOneById(id);

            if (!record) {
                return;
            }

            const now = this.clock.now();

            await this.trimExpired(repository, record.id, record.activeRunId, limits, now);

            for (const generation of await this.itemGenerations(repository, record.id)) {
                await this.trimCount(repository, record.id, generation, record.activeRunId, limits.maxStoredItems);
            }

            await this.dropExpiredNotes(repository, record.id, now);
        });
    }

    /**
     * The note operation records of one conversation that prune removes:
     * candidates in pages read without a transaction, `isSettled` asked
     * outside any transaction, then removed under the row lock after a
     * re-check. Resolves the first failure of `isSettled`, if any.
     */
    protected async pruneOperations(
        id: string,
        limits: ResolvedConversationLimits,
        isSettled: (runId: string) => Promise<boolean>,
        settled: Map<string, boolean>,
    ): Promise<{ error: unknown } | undefined> {
        let failure: { error: unknown } | undefined;
        let after: string | undefined;

        for (;;) {
            const record = await this.repository.findOneById(id);

            if (!record) {
                return failure;
            }

            const before = new Date(this.clock.now().getTime() - limits.retentionMs);
            const conditions: ICondition[] = [eq('scopeId', id), lte('createdAt', before)];

            if (record.activeRunId !== undefined) {
                conditions.push(ne('runId', record.activeRunId));
            }

            if (after !== undefined) {
                conditions.push(gt('id', after));
            }

            const { data: candidates } = await this.repository.operations.findMany(defineQuery({
                filters: and(...conditions),
                sorts: { id: 'ASC' },
                pagination: { limit: TRIM_PAGE },
            }));

            if (candidates.length === 0) {
                return failure;
            }

            after = candidates[candidates.length - 1]!.id;

            const removable: string[] = [];

            // no transaction is held while the classifier runs: it may need the same storage
            for (const candidate of candidates) {
                if (!settled.has(candidate.runId)) {
                    try {
                        settled.set(candidate.runId, await isSettled(candidate.runId));
                    } catch (error) {
                        failure ??= { error };

                        continue;
                    }
                }

                if (settled.get(candidate.runId)) {
                    removable.push(candidate.id);
                }
            }

            if (removable.length === 0) {
                continue;
            }

            await this.repository.transaction(async (repository) => {
                const current = await repository.findOneById(id);

                if (!current) {
                    return;
                }

                const threshold = this.clock.now().getTime() - limits.retentionMs;
                // re-read under the row lock: a record may have gone or changed, or its run become active again
                const stale = (await repository.operations.findManyBy({ id: removable }))
                    .filter((operation) => settled.get(operation.runId) === true &&
                        operation.runId !== current.activeRunId &&
                        operation.createdAt.getTime() <= threshold);

                if (stale.length > 0) {
                    await repository.operations.removeManyBy({ id: stale.map((operation) => operation.id) });
                }
            });
        }
    }

    /**
     * The recall of a turn: the generation's sent items newest first, read
     * as sizes only (ids and stored byte lengths, no text), a page of
     * RECALL_FIRST_PAGE, then pages of RECALL_PAGE; each item taken whole
     * while it fits the remaining maxHistoryBytes (an item that does not
     * fit is skipped and older, smaller ones are still taken), until
     * maxItems or the byte budget is used (`selectRecent`); then the text
     * of the selected items in one read, the snapshot built by
     * `buildSnapshotContent` with the live notes, and `omitted` the sent
     * items not taken.
     */
    protected async recall(
        repository: IConversationRepository,
        record: ConversationRecord,
        limits: ResolvedConversationLimits,
        now: Date,
    ): Promise<Omit<ConversationSnapshot, 'scope' | 'runId' | 'createdAt'>> {
        const where = { scopeId: record.id, generation: record.generation };
        let chosen: Pick<ConversationItemRecord, 'id' | 'bytes'>[] = [];
        let bytes = 0;
        let seen = 0;
        let total: number | undefined;
        let before: number | undefined;

        while (chosen.length < limits.maxItems && bytes < limits.maxHistoryBytes) {
            const conditions: ICondition[] = [
                eq('scopeId', where.scopeId),
                eq('generation', where.generation),
                eq('status', 'sent'),
            ];

            if (before !== undefined) {
                conditions.push(lt(CONVERSATION_ITEM_STORED_ORDER, before));
            }

            const limit = before === undefined ? RECALL_FIRST_PAGE : RECALL_PAGE;
            const { data, meta } = await repository.items.findMany(defineQuery({
                fields: [CONVERSATION_ITEM_STORED_ORDER, 'bytes'],
                filters: and(...conditions),
                sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'DESC' },
                pagination: { limit },
            }));

            total ??= meta.total;

            if (data.length === 0) {
                break;
            }

            before = data[data.length - 1]!.id;
            seen += data.length;

            // newer chosen items keep their priority: the page is older than every chosen item
            chosen = selectRecent([...data.reverse(), ...chosen], (item) => item.bytes, limits);
            bytes = chosen.reduce((sum, item) => sum + item.bytes, 0);

            // a short page, or every sent item counted by the first page seen
            if (data.length < limit || seen >= total) {
                break;
            }
        }

        // the text of the selected items only, in transcript order
        const order = new Map(chosen.map((item, index) => [item.id, index]));
        const items = chosen.length === 0 ?
            [] :
            (await repository.items.findManyBy({ ...where, id: chosen.map((item) => item.id) }))
                .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
                .map((item) => readItem(item));
        const notes = (await repository.notes.findManyBy(where))
            .filter((note) => isNoteActive(note, now))
            .map((note) => readNote(note));
        const content = buildSnapshotContent(items, notes, limits);

        return { ...content, omitted: (total ?? 0) - content.itemIds.length };
    }

    /** Removes the scope's items past retention, of every generation, never the spared run's. */
    protected async trimExpired(
        repository: IConversationRepository,
        scopeId: string,
        spared: string | undefined,
        limits: ResolvedConversationLimits,
        now: Date,
    ): Promise<void> {
        const before = new Date(now.getTime() - limits.retentionMs);
        const conditions: ICondition[] = [eq('scopeId', scopeId), lte('createdAt', before)];

        if (spared !== undefined) {
            conditions.push(ne('runId', spared));
        }

        await this.removeItemPages(repository, conditions, Infinity);
    }

    /** Keeps a generation's newest `max` items: removes the oldest beyond it, never the spared run's. */
    protected async trimCount(
        repository: IConversationRepository,
        scopeId: string,
        generation: number,
        spared: string | undefined,
        max: number,
    ): Promise<void> {
        const { meta } = await repository.items.findMany(defineQuery({
            fields: [CONVERSATION_ITEM_STORED_ORDER],
            filters: and(eq('scopeId', scopeId), eq('generation', generation)),
            pagination: { limit: 1 },
        }));
        const excess = meta.total - max;

        if (excess <= 0) {
            return;
        }

        const conditions: ICondition[] = [eq('scopeId', scopeId), eq('generation', generation)];

        if (spared !== undefined) {
            conditions.push(ne('runId', spared));
        }

        await this.removeItemPages(repository, conditions, excess);
    }

    /** Removes up to `count` of the oldest items matching the conditions, a page of ids at a time. */
    protected async removeItemPages(repository: IConversationRepository, conditions: ICondition[], count: number): Promise<void> {
        let left = count;

        while (left > 0) {
            const { data } = await repository.items.findMany(defineQuery({
                fields: [CONVERSATION_ITEM_STORED_ORDER],
                filters: and(...conditions),
                sorts: { [CONVERSATION_ITEM_STORED_ORDER]: 'ASC' },
                pagination: { limit: Math.min(left, TRIM_PAGE) },
            }));

            if (data.length === 0) {
                return;
            }

            await repository.items.removeManyBy({ id: data.map((item) => item.id) });
            left -= data.length;

            if (data.length < TRIM_PAGE) {
                return;
            }
        }
    }

    /** The generations the scope holds items of, ascending: one read per generation. */
    protected async itemGenerations(repository: IConversationRepository, scopeId: string): Promise<number[]> {
        const generations: number[] = [];

        for (;;) {
            const last = generations.at(-1);
            const { data } = await repository.items.findMany(defineQuery({
                fields: ['generation'],
                filters: last === undefined ? eq('scopeId', scopeId) : and(eq('scopeId', scopeId), gt('generation', last)),
                sorts: { generation: 'ASC' },
                pagination: { limit: 1 },
            }));

            if (data.length === 0) {
                return generations;
            }

            generations.push(data[0]!.generation);
        }
    }

    /** Removes the scope's expired notes (at most the live limit and those expired since the last write). */
    protected async dropExpiredNotes(repository: IConversationRepository, scopeId: string, now: Date): Promise<void> {
        const { data } = await repository.notes.findMany(defineQuery({
            fields: ['id'],
            filters: and(eq('scopeId', scopeId), lte('expiresAt', now)),
        }));

        if (data.length > 0) {
            await repository.notes.removeManyBy({ id: data.map((note) => note.id) });
        }
    }

    /** The current generation's live notes, by key in code-point order. */
    protected async liveNotes(scope: ConversationScope): Promise<ConversationNote[]> {
        const record = await this.repository.findOneById(scope.id);

        if (!record || record.generation !== scope.generation) {
            return [];
        }

        const now = this.clock.now();

        return (await this.repository.notes.findManyBy({ scopeId: record.id, generation: record.generation }))
            .filter((note) => isNoteActive(note, now))
            .map((note) => readNote(note))
            .sort(compareNotes);
    }

    /**
     * A new item of the handed-in repository with its stored byte length:
     * every item the service stores is created here, so `bytes` is always
     * the size the recall budgets its text with.
     */
    protected createItem(
        repository: IConversationRepository,
        value: Omit<ConversationItemRecord, 'id' | 'bytes'>,
    ): ConversationItemRecord {
        return repository.items.create({ ...value, bytes: itemBytes(value.text) });
    }

    /** The row of the scope's current generation, else the stale-scope refusal. */
    protected current(scope: ConversationScope, record: ConversationRecord | null): ConversationRecord {
        if (!record || record.generation !== scope.generation) {
            throw staleError();
        }

        return record;
    }

    protected snapshotOf(record: ConversationRecord, runId: string): ConversationSnapshot {
        const snapshot = record.snapshot!;

        return {
            scope: readScope(record),
            runId,
            messages: structuredClone(snapshot.messages),
            itemIds: [...snapshot.itemIds],
            noteKeys: [...snapshot.noteKeys],
            createdAt: new Date(snapshot.createdAt.getTime()),
            omitted: snapshot.omitted,
        };
    }
}
