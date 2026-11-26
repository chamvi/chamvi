/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { CHUNKER_VERSION } from '../chunk/constants.ts';
import { contentHash } from '../chunk/module.ts';
import { managedNameError } from '../collection/helpers.ts';
import type { KnowledgeCollection } from '../store/types.ts';
import { storedDocument } from '../source/helpers.ts';
import { embedDocument } from './embed.ts';
import {
    claimLockFence,
    documentOf,
    highestGeneration,
    sameDetails,
    sameOrigin,
    servesDefinition,
    settled,
    withoutPending,
    writeOptionsOf,
} from './helpers/index.ts';
import type { SyncCollectionInput } from './types.ts';

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
