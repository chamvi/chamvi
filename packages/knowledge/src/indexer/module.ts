/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { IClock, ILockService } from '@chamvi/core';
import { ErrorCode, ValidationError } from '@chamvi/core';
import { isObject } from 'smob';
import { CHUNKER_VERSION } from '../chunk/constants.ts';
import { managedNameError } from '../collection/helpers.ts';
import { chunkText, contentHash } from '../chunk/module.ts';
import type { KnowledgeErrorContext } from '../knowledge/types.ts';
import { lockKey } from '../service/helpers.ts';
import type { IKnowledgeService } from '../service/types.ts';
import type {
    KnowledgeChunkInput,
    KnowledgeCollection,
    KnowledgeDocument,
} from '../store/types.ts';
import { storedDocument } from '../source/helpers.ts';
import type { KnowledgeDocumentInput } from '../source/types.ts';
import {
    EMBED_BATCH_SIZE,
    KNOWLEDGE_LOCK_TTL_MS,
    KNOWLEDGE_RETRY_MAX_MS,
    KNOWLEDGE_RETRY_MS,
} from './constants.ts';
import {
    claimLockFence,
    createIndexLock,
    highestGeneration,
    isLeaseLost,
    isRepositoryNotFound,
    messageOf,
    sameDetails,
    sameOrigin,
    servesDefinition,
    settled,
    wait,
    withoutPending,
    writeOptionsOf,
} from './helpers.ts';
import type {
    CollectionLoopInput,
    EmbedDocumentInput,
    EmbeddedDocument,
    KnowledgeIndexLock,
    KnowledgeWakeReason,
    SyncCollectionInput,
} from './types.ts';

/** The wait after the `failures`-th failure in a row: 5 s doubling, capped. */
function backoffOf(failures: number): number {
    return Math.min(KNOWLEDGE_RETRY_MS * (2 ** Math.min(Math.max(failures - 1, 0), 30)), KNOWLEDGE_RETRY_MAX_MS);
}

/** A configuration error (InvalidAgentDefinitionError, by code across core copies): retrying cannot help. */
function isConfigurationError(error: unknown): boolean {
    return isObject(error) && error.code === ErrorCode.INVALID_AGENT_DEFINITION;
}

function documentOf(
    collection: string,
    input: KnowledgeDocumentInput,
    hash: string,
    generation: number,
    updatedAt: Date,
): KnowledgeDocument {
    return {
        collection,
        id: input.id,
        content: input.content,
        hash,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.source === undefined ? {} : { source: input.source }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        status: 'ready',
        generation,
        updatedAt,
    };
}

/**
 * The vectors of one batch checked: one per text, numbers only, one length
 * across the generation (ValidationError otherwise); answers that length.
 */
function assertVectors(label: string, vectors: unknown, count: number, dimensions: number | undefined): number {
    if (!Array.isArray(vectors) || vectors.length !== count) {
        throw new ValidationError(`${label}: the embedding model returned no vector per text.`);
    }

    let length = dimensions;

    for (const vector of vectors) {
        const numbers = Array.isArray(vector) && vector.length > 0 && vector.every((value) => Number.isFinite(value));

        if (!numbers) {
            throw new ValidationError(`${label}: the embedding model returned a vector that is no list of numbers.`);
        }

        length ??= vector.length;

        if (vector.length !== length) {
            throw new ValidationError(
                `${label}: the embedding model returned ${vector.length}-dimensional vectors, the generation holds ${length}.`,
            );
        }
    }

    return length!;
}

/**
 * The chunk-and-embed step of one document, shared by every pass: chunks the
 * content, embeds the chunks in batches of EMBED_BATCH_SIZE with `model`,
 * checks each batch's vectors against the generation's length (learned from
 * the first batch when unknown; `learned` is called once with it) and gives
 * every chunk the document's title and source. `renew` is asked before every
 * batch, so a document embedded longer than the lease keeps it; its false
 * answer ends the embedding with undefined (the lock is lost, nothing to write).
 */
export async function embedDocument(input: EmbedDocumentInput): Promise<EmbeddedDocument | undefined> {
    const { document, label } = input;
    const chunks = chunkText(document.content);
    const inputs: KnowledgeChunkInput[] = [];
    let { dimensions } = input;

    for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH_SIZE) {
        if (input.renew && !await input.renew()) {
            return undefined;
        }

        const batch = chunks.slice(offset, offset + EMBED_BATCH_SIZE);
        const vectors = await input.embed(input.model, batch.map((chunk) => chunk.text), input.signal);
        const learned = dimensions === undefined;

        dimensions = assertVectors(label, vectors, batch.length, dimensions);

        if (learned) {
            await input.learned?.(dimensions);
        }

        for (const [index, chunk] of batch.entries()) {
            inputs.push({
                ...chunk,
                vector: vectors[index]!,
                ...(document.title === undefined ? {} : { title: document.title }),
                ...(document.source === undefined ? {} : { source: document.source }),
            });
        }
    }

    return {
        chunks: inputs,
        ...(dimensions === undefined ? {} : { dimensions }),
    };
}

/**
 * One pass over a declared collection: picks the generation to write (the
 * served one when model and chunker match, else the pending re-embed), embeds
 * every new or changed document into it, deletes the documents the sources no
 * longer yield (none when a source marked its read incomplete: reported once;
 * a re-embed then fails, retried on the backoff) and, for a re-embed, switches the served generation and deletes
 * the previous one. A document with unchanged content, title and source costs
 * nothing (its chunks carry the title and source). Ends early, without an
 * error, once `lock.renew()` answers false. Every write carries the lock's
 * fence (a first pass creates the record create-only, then claims it with
 * the lock's token, ending when the claimed row is not the created one), so
 * a write after another owner took the lock is a `LeaseLostError`.
 */
export async function syncCollection(input: SyncCollectionInput): Promise<void> {
    const {
        definition,
        service,
        clock,
        signal,
        lock,
    } = input;
    const { name } = definition;
    const label = `Knowledge collection "${name}"`;
    let stored = await service.findOneCollection(name);

    if (stored && lock.fence === undefined) {
        // the record appeared after the loop claimed the fence (no row then):
        // claim it while the lock holds, then decide on what is stored from here on
        if (!await lock.renew()) {
            return;
        }

        await claimLockFence(service, name, lock);

        stored = await service.findOneCollection(name);
    }

    if (stored?.kind === 'managed') {
        throw managedNameError(name);
    }

    const startedAt = new Date(clock.now());
    let record: KnowledgeCollection = {
        ...(stored ?? {
            name,
            kind: 'declared',
            generation: 0,
            model: definition.model,
            chunker: CHUNKER_VERSION,
            status: 'pending',
            createdAt: startedAt,
        }),
        // a downgrade is immediate, an upgrade waits for the end: until then the
        // served chunks may still hold the previous sources' content
        trusted: stored ? stored.trusted && definition.trusted : definition.trusted,
        updatedAt: startedAt,
    };
    let target: number;
    let abandoned: number | undefined;
    const serves = servesDefinition(record, definition);

    if (serves) {
        // a pending re-embed toward another model is dropped (the served model came back)
        target = record.generation;
        record = {
            ...withoutPending(record),
            lastGeneration: highestGeneration(record),
            status: 'ready',
        };
    } else if (record.pending?.model === definition.model && record.pending.chunker === CHUNKER_VERSION) {
        target = record.pending.generation;
    } else {
        abandoned = record.pending?.generation;
        // never a number given out before: documents of an abandoned generation still name it
        target = highestGeneration(record) + 1;
        record = {
            ...record,
            pending: {
                generation: target,
                model: definition.model,
                chunker: CHUNKER_VERSION,
            },
            lastGeneration: target,
        };
    }

    if (target !== record.generation) {
        record = { ...record, status: record.generation > 0 ? 'stale' : 'pending' };
    }

    // without a token only a create: a record another owner created meanwhile is never replaced
    const saved = await service.saveCollection(record, lock.fence === undefined ? { create: true } : writeOptionsOf(lock));

    if (lock.fence === undefined) {
        // the create may have outlasted the lease: never a token once another owner may hold it
        if (!await lock.renew()) {
            return;
        }

        // the record exists from here on: the writes that follow carry its fence
        const fence = await claimLockFence(service, name, lock);

        // deleted (or deleted and created again) since the create: never a write
        // without a fence, nor one into another row of the name
        if (fence?.id !== saved.id) {
            return;
        }
    }

    if (serves) {
        // also what a crash between an earlier switch and its cleanup left behind
        await service.deleteGenerationsExcept(name, target, writeOptionsOf(lock));
    } else if (abandoned !== undefined) {
        await service.deleteGeneration(name, abandoned, writeOptionsOf(lock));
    }

    let dimensions = target === record.generation ? record.dimensions : record.pending?.dimensions;
    const seen = new Set<string>();
    // what the sources could not read this pass (an unlistable folder, a read error)
    const missed: string[] = [];
    const context = {
        signal,
        onError: input.onError,
        incomplete: (reason: string) => {
            missed.push(typeof reason === 'string' && reason.length > 0 ? reason : 'no reason given');
        },
    };

    for (const source of definition.sources) {
        for await (const yielded of source.documents(context)) {
            signal.throwIfAborted();

            const document = storedDocument(yielded);

            if (seen.has(document.id)) {
                input.onError(new ValidationError(
                    `${label}: document "${document.id}" is yielded by more than one source; the first is kept.`,
                ));

                continue;
            }

            seen.add(document.id);

            if (!await lock.renew()) {
                return;
            }

            const hash = contentHash(document.content);
            const existing = await service.findOneDocument(name, document.id);

            // a new title or source re-writes the chunks: each carries its own copy for search results
            if (
                existing &&
                existing.hash === hash &&
                existing.generation === target &&
                existing.status === 'ready' &&
                sameOrigin(existing, document)
            ) {
                if (!sameDetails(existing, document)) {
                    await service.saveDocument(documentOf(name, document, hash, target, new Date(clock.now())), writeOptionsOf(lock));
                }

                continue;
            }

            const embedded = await embedDocument({
                label,
                model: definition.model,
                document,
                embed: input.embed,
                signal,
                ...(dimensions === undefined ? {} : { dimensions }),
                learned: async (length) => {
                    if (!(record.pending && target === record.pending.generation)) {
                        return;
                    }

                    record = { ...record, pending: { ...record.pending, dimensions: length } };
                    await service.saveCollection(record, writeOptionsOf(lock));
                },
                renew: () => lock.renew(),
            });

            // the lease was lost between two batches
            if (!embedded) {
                return;
            }

            ({ dimensions } = embedded);

            signal.throwIfAborted();

            // embedding may have outlasted the lease: never write once another owner may hold it
            if (!await lock.renew()) {
                return;
            }

            await service.replaceChunks(name, document.id, target, embedded.chunks, writeOptionsOf(lock));
            await service.saveDocument(documentOf(name, document, hash, target, new Date(clock.now())), writeOptionsOf(lock));
        }
    }

    signal.throwIfAborted();

    if (!await lock.renew()) {
        return;
    }

    if (missed.length > 0) {
        const partial = `${label}: a source read only part of its documents (${missed[0]}` +
            `${missed.length > 1 ? `, and ${missed.length - 1} more` : ''})`;

        if (target !== record.generation) {
            // the documents it missed live in the served generation only: switching would drop them
            throw new ValidationError(`${partial}; the re-embed waits for a complete read.`);
        }

        // a document it could not read is no deleted document
        input.onError(new ValidationError(`${partial}; no document was deleted.`));
    } else {
        for (const id of await service.findDocumentIds(name)) {
            if (!seen.has(id)) {
                await service.deleteDocument(name, id, writeOptionsOf(lock));
            }
        }
    }

    const finishedAt = new Date(clock.now());

    if (target === record.generation) {
        await service.saveCollection({
            ...settled(record),
            trusted: definition.trusted,
            ...(dimensions === undefined ? {} : { dimensions }),
            status: 'ready',
            syncedAt: finishedAt,
            updatedAt: finishedAt,
        }, writeOptionsOf(lock));

        return;
    }

    const previous = record.generation;
    // the previous model's length never carries over: a switch without a chunk learned none
    const switched = settled(record);

    delete switched.dimensions;

    await service.saveCollection({
        ...switched,
        trusted: definition.trusted,
        generation: target,
        model: definition.model,
        ...(dimensions === undefined ? {} : { dimensions }),
        chunker: CHUNKER_VERSION,
        status: 'ready',
        syncedAt: finishedAt,
        updatedAt: finishedAt,
    }, writeOptionsOf(lock));

    if (previous > 0) {
        await service.deleteGeneration(name, previous, writeOptionsOf(lock));
    }
}

/**
 * Stores a failure on the declared record (never on a managed one), only while
 * the lock is still this owner's (renewed, and the write fenced; a pass
 * without a fence claims it first, and with no record records nothing): a
 * lost lock leaves the record to its holder.
 * The failure count and the time of the next attempt go with it, so every
 * replica backs off together. Whether it was stored.
 */
async function recordErrorUnderLock(
    service: IKnowledgeService,
    name: string,
    error: unknown,
    clock: IClock,
    lock: KnowledgeIndexLock,
): Promise<boolean> {
    if (!await lock.renew()) {
        return false;
    }

    if (lock.fence === undefined) {
        // a pass that failed before it had a fence: never a write without one
        await claimLockFence(service, name, lock);

        if (lock.fence === undefined) {
            return false;
        }
    }

    const record = await service.findOneCollection(name);

    if (record?.kind !== 'declared') {
        return false;
    }

    const now = new Date(clock.now());
    const failures = (record.failures ?? 0) + 1;

    await service.saveCollection({
        ...record,
        error: messageOf(error),
        failures,
        retryAt: new Date(now.getTime() + backoffOf(failures)),
        updatedAt: now,
    }, writeOptionsOf(lock));

    return true;
}

/** How long until the stored backoff of the collection ends (0 when none). */
async function retryDelayOf(service: IKnowledgeService, name: string, clock: IClock): Promise<number> {
    const record = await service.findOneCollection(name);
    const retryAt = record?.kind === 'declared' ? record.retryAt : undefined;

    if (!retryAt) {
        return 0;
    }

    // a clock skewed between replicas never parks the loop longer than the cap
    return Math.min(Math.max(retryAt.getTime() - clock.now(), 0), KNOWLEDGE_RETRY_MAX_MS);
}

/**
 * How long until a pass is due (0: now; undefined: only on a wake): at once
 * for a missing record (deleted elsewhere: rebuilt), an orphaned one (marked
 * by a replica that does not declare it: declared again) or one no pass
 * completed yet (a failed rebuild is retried, after its stored backoff), else, with
 * `idleMs`, that long after the stored `syncedAt`, the end of the last
 * successful pass on any replica.
 */
async function dueDelayOf(
    service: IKnowledgeService,
    name: string,
    clock: IClock,
    idleMs: number | undefined,
): Promise<number | undefined> {
    const record = await service.findOneCollection(name);

    if (!record?.syncedAt || record.status === 'orphaned') {
        return 0;
    }

    if (idleMs === undefined) {
        return undefined;
    }

    // a clock skewed between replicas never parks the loop longer than the interval
    return Math.min(Math.max(idleMs - (clock.now() - record.syncedAt.getTime()), 0), idleMs);
}

/** The idle wait until a due pass (none: `undefined`) or the next record check, whichever comes first. */
function idleWaitOf(dueIn: number | undefined, checkMs: number | undefined): number | undefined {
    if (dueIn === undefined) {
        return checkMs;
    }

    return checkMs === undefined ? dueIn : Math.min(dueIn, checkMs);
}

/**
 * Keeps one collection current: runs `pass` under the store lock
 * `knowledge:<name>`, then idles until a wake (`wake.notify()`) or, with
 * `idleMs`, until that long after the last successful pass, and runs it
 * again. An interval pass is skipped while the stored `syncedAt` is younger
 * than `idleMs` (another replica ran it; checked again under the lock), so
 * replicas share one pass per interval; a wake always runs one. While
 * another owner holds the lock, waits `KNOWLEDGE_RETRY_MS` and tries again,
 * so this replica's own sources are synced once the lock is free (an
 * unchanged document embeds nothing). A failure is stored with the time of
 * the next attempt (still under the lock, so no replica's later sync is
 * overwritten) and reported; every replica waits for that time before it
 * takes the lock again (5 s doubling to `KNOWLEDGE_RETRY_MAX_MS` per failure
 * in a row, across replicas), except on its own first attempt, and a wake
 * meanwhile waits for it too. A configuration error
 * (InvalidAgentDefinitionError) is stored and reported once and ends the
 * loop. A failed lock acquire or store read is only reported and retried on
 * this loop's own backoff. Each pass first renews the lock (no pass when it
 * fails) and claims the collection's fence (`lock.fence`) with the lock's
 * token; a claim or write the fence refuses (`LeaseLostError`: another owner
 * took the lock) ends the pass like a lost lock: nothing reported or stored,
 * no backoff. With `checkMs`, an idle loop also reads its record that often:
 * a missing one (deleted on another replica), an orphaned one (marked by a
 * replica that does not declare it) or one no pass completed yet
 * runs a pass whatever `idleMs` says; a synced one costs that read only. Never rejects; an abort ends it.
 */
export async function runCollection(input: CollectionLoopInput): Promise<void> {
    const {
        name,
        service,
        locks,
        owner,
        clock,
        signal,
        wake,
        idleMs,
        checkMs,
    } = input;
    const key = lockKey(name);
    const context: KnowledgeErrorContext = { collection: name };
    const report = (error: unknown) => input.onError(error, context);
    // this loop's own backoff, for store failures that leave no stored retry time
    let delay = KNOWLEDGE_RETRY_MS;
    let first = true;
    // what started the next pass: only an interval one is skipped for a younger pass
    let reason: 'start' | Exclude<KnowledgeWakeReason, 'abort'> = 'start';
    const backOff = async () => {
        await wait(clock, delay, signal);
        delay = Math.min(delay * 2, KNOWLEDGE_RETRY_MAX_MS);
    };

    while (!signal.aborted) {
        const honourRetry = !first;
        let token: number | undefined;

        first = false;

        try {
            const dueIn = reason === 'timeout' ? await dueDelayOf(service, name, clock, idleMs) : 0;

            if (dueIn !== 0) {
                const woken = await wake.wait(clock, idleWaitOf(dueIn, checkMs), signal);

                if (woken === 'abort') {
                    return;
                }

                reason = woken;

                continue;
            }

            const retryIn = honourRetry ? await retryDelayOf(service, name, clock) : 0;

            if (retryIn > 0) {
                await wait(clock, retryIn, signal);

                if (signal.aborted) {
                    return;
                }
            }

            token = await locks.acquire(key, owner, KNOWLEDGE_LOCK_TTL_MS);
        } catch (error) {
            if (signal.aborted) {
                return;
            }

            report(error);
            await backOff();

            continue;
        }

        if (token !== undefined) {
            const lock = createIndexLock(locks, key, owner, clock, token);
            let failure: { error: unknown; stored: boolean } | undefined;
            // a claim or write refused for a fence another owner claimed: the lock is lost
            let fenced = false;
            let deferred = false;
            let dueIn: number | undefined = 0;

            try {
                // another replica may have failed between our wait and the acquire
                deferred = honourRetry && await retryDelayOf(service, name, clock) > 0;

                if (!deferred && reason === 'timeout') {
                    // or run this interval's pass
                    dueIn = await dueDelayOf(service, name, clock, idleMs);
                }

                // the reads above may have outlasted the lease: no pass once another owner may hold it
                if (!deferred && dueIn === 0 && await lock.renew()) {
                    // a wake from here on asks for one more pass
                    wake.clear();
                    // a newer holder's claim refuses this one (LeaseLostError): no pass then
                    await claimLockFence(service, name, lock);
                    await input.pass(lock, report);
                }
            } catch (error) {
                if (isLeaseLost(error)) {
                    fenced = true;
                } else {
                    failure = { error, stored: false };

                    if (!signal.aborted) {
                        failure.stored = await recordErrorUnderLock(service, name, error, clock, lock).catch((recordError: unknown) => {
                            if (!isLeaseLost(recordError)) {
                                report(recordError);
                            }

                            return false;
                        });
                    }
                }
            } finally {
                await locks.release(key, owner).catch(report);
            }

            if (signal.aborted) {
                return;
            }

            if (deferred) {
                continue;
            }

            if (failure) {
                report(failure.error);

                if (isConfigurationError(failure.error)) {
                    return;
                }

                if (!failure.stored) {
                    await backOff();
                }

                continue;
            }

            if (!lock.lost && !fenced) {
                delay = KNOWLEDGE_RETRY_MS;

                // a pass ran (dueIn 0): the next is an interval away
                const woken = await wake.wait(clock, idleWaitOf(dueIn === 0 ? idleMs : dueIn, checkMs), signal);

                if (woken === 'abort') {
                    return;
                }

                reason = woken;

                continue;
            }
        }

        // the holder may sync other sources than this replica's: wait for the
        // lock and sync ours (content hashes make an unchanged sync embed nothing)
        await wait(clock, KNOWLEDGE_RETRY_MS, signal);
    }
}

/**
 * Marks every declared record without a definition `orphaned`: kept with its
 * documents and chunks, searchable by no agent. Each mark is written under
 * the record's `knowledge:<name>` lock (a held one means a replica that
 * declares it is syncing it: left alone), re-read once the lock is held and
 * its fence claimed with the lock's token; a claim or mark the fence refuses
 * (another owner took the lock meanwhile) or that finds the row deleted
 * leaves the record alone too. Each call holds the locks under an owner of
 * its own (`<owner>:orphans:<uuid>`): a mark stalled past the lock TTL then
 * never releases the lease a later mark of the same instance holds.
 * `records` is a list the caller already read (the managed poll's), else
 * `findCollections()` is read.
 */
export async function markOrphans(
    service: IKnowledgeService,
    declared: ReadonlySet<string>,
    locks: Pick<ILockService, 'acquire' | 'release'>,
    owner: string,
    clock: IClock,
    records?: readonly KnowledgeCollection[],
): Promise<void> {
    const isOrphan = (record: KnowledgeCollection | undefined): record is KnowledgeCollection => record !== undefined &&
        record.kind === 'declared' &&
        record.status !== 'orphaned' &&
        !declared.has(record.name);
    const holder = `${owner}:orphans:${randomUUID()}`;

    for (const candidate of records ?? await service.findCollections()) {
        if (!isOrphan(candidate)) {
            continue;
        }

        const key = lockKey(candidate.name);

        const token = await locks.acquire(key, holder, KNOWLEDGE_LOCK_TTL_MS);

        if (token === undefined) {
            continue;
        }

        try {
            const fence = await service.claimFence(candidate.name, token);
            const record = await service.findOneCollection(candidate.name);

            if (fence && isOrphan(record)) {
                await service.saveCollection({
                    ...record,
                    status: 'orphaned',
                    updatedAt: new Date(clock.now()),
                }, { fence });
            }
        } catch (error) {
            // another owner took the lock, or the record was deleted meanwhile: left to them
            if (!isLeaseLost(error) && !isRepositoryNotFound(error)) {
                throw error;
            }
        } finally {
            await locks.release(key, holder);
        }
    }
}
