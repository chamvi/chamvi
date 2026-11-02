/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { CHUNKER_VERSION } from '../chunk/constants.ts';
import {
    highestGeneration,
    messageOf,
    sameOrigin,
    settled,
} from '../indexer/helpers.ts';
import { embedDocument } from '../indexer/module.ts';
import type { KnowledgeCollection, KnowledgeDocument } from '../repository/types.ts';
import { MANAGED_PAGE_SIZE } from './constants.ts';
import { isProviderRejection, needsReembed } from './helpers.ts';
import type { SyncManagedInput } from './types.ts';

/** What embedding one document left: `stop` ends the pass (the lock or the collection is gone). */
type Outcome = { stop: true } | { stop: false; dimensions: number | undefined };

/** Whether the stored record is still the managed collection the pass read (not deleted, not re-created). */
async function isSameCollection(input: SyncManagedInput, record: KnowledgeCollection): Promise<KnowledgeCollection | undefined> {
    const current = await input.repository.findOneCollection(input.name);

    if (!current || current.kind !== 'managed' || current.createdAt.getTime() !== record.createdAt.getTime()) {
        return undefined;
    }

    return current;
}

/**
 * Embeds one document with `model` and writes its chunks at `generation`,
 * then marks it `ready` there, both only while the stored document still has
 * the hash, title and source that were embedded (the chunks carry a copy of
 * title and source; a PUT meanwhile leaves it `pending` for the next round)
 * and the collection is the one the pass read. A document deleted between
 * the re-read and the ready write gets its chunks of that generation removed
 * again. A provider rejection
 * marks it `failed` with the error and removes its chunks of that generation
 * (the content they hold was replaced); any other error fails the pass.
 */
async function embedOne(
    input: SyncManagedInput,
    record: KnowledgeCollection,
    document: KnowledgeDocument,
    model: string,
    generation: number,
    dimensions: number | undefined,
): Promise<Outcome> {
    const {
        name,
        repository,
        signal,
        lock,
    } = input;
    let embedded: Awaited<ReturnType<typeof embedDocument>> | undefined;
    let rejection: unknown;

    try {
        embedded = await embedDocument({
            label: `Knowledge collection "${name}"`,
            model,
            document,
            embed: input.embed,
            signal,
            ...(dimensions === undefined ? {} : { dimensions }),
        });
    } catch (error) {
        if (signal.aborted || !isProviderRejection(error)) {
            throw error;
        }

        rejection = error;
    }

    signal.throwIfAborted();

    // embedding may have outlasted the lease (never write once another owner may hold it),
    // and the collection may have been deleted or re-created meanwhile
    if (!await lock.renew() || !await isSameCollection(input, record)) {
        return { stop: true };
    }

    const current = await repository.findOneDocument(name, document.id);

    if (!current || current.hash !== document.hash || !sameOrigin(current, document)) {
        // replaced or deleted while it was embedded
        return { stop: false, dimensions: embedded?.dimensions ?? dimensions };
    }

    if (!embedded) {
        await repository.replaceChunks(name, document.id, generation, []);
        await repository.updateDocument(name, document.id, document, {
            status: 'failed',
            error: messageOf(rejection),
            generation,
        });

        return { stop: false, dimensions };
    }

    await repository.replaceChunks(name, document.id, generation, embedded.chunks);

    if (
        !await repository.updateDocument(name, document.id, document, { status: 'ready', generation }) &&
        !await repository.findOneDocument(name, document.id)
    ) {
        // deleted after the re-read: the chunks just written would be searchable orphans
        await repository.replaceChunks(name, document.id, generation, []);
    }

    return { stop: false, dimensions: embedded.dimensions };
}

/**
 * Re-embeds every document of a stale managed collection into the next
 * generation with `model` (or continues the re-embed the record names as
 * pending), then switches the served generation and deletes the previous
 * one. Every record write re-reads the record first and is skipped once it
 * was deleted or re-created. The switched record, or undefined when the pass
 * ends (the lock or the collection is gone).
 */
async function reembed(
    input: SyncManagedInput,
    stored: KnowledgeCollection,
    model: string,
): Promise<KnowledgeCollection | undefined> {
    const {
        name,
        repository,
        clock,
        signal,
        lock,
    } = input;
    let record = stored;
    let target: number;

    if (record.pending?.model === model && record.pending.chunker === CHUNKER_VERSION) {
        target = record.pending.generation;
    } else {
        const abandoned = record.pending?.generation;

        // never a number given out before: documents of an abandoned generation still name it
        target = highestGeneration(record) + 1;

        const current = await isSameCollection(input, record);

        if (!current) {
            return undefined;
        }

        record = {
            ...current,
            pending: {
                generation: target,
                model,
                chunker: CHUNKER_VERSION,
            },
            lastGeneration: target,
            updatedAt: clock.now(),
        };
        await repository.saveCollection(record);

        if (abandoned !== undefined) {
            await repository.deleteGeneration(name, abandoned);
        }
    }

    let dimensions = record.pending?.dimensions;

    // the ids now: a document PUT later is pending and embedded after the switch
    for (const id of await repository.findDocumentIds(name)) {
        signal.throwIfAborted();

        if (!await lock.renew()) {
            return undefined;
        }

        const document = await repository.findOneDocument(name, id);

        // deleted meanwhile, or written for this generation by an interrupted re-embed
        if (!document || (document.generation === target && document.status !== 'pending')) {
            continue;
        }

        const outcome = await embedOne(input, record, document, model, target, dimensions);

        if (outcome.stop) {
            return undefined;
        }

        if (dimensions === undefined && outcome.dimensions !== undefined) {
            // keep the learned length, so a resumed re-embed checks its vectors against it
            if (!await lock.renew()) {
                return undefined;
            }

            const current = await isSameCollection(input, record);

            if (!current?.pending || current.pending.generation !== target) {
                return undefined;
            }

            record = {
                ...current,
                pending: { ...current.pending, dimensions: outcome.dimensions },
                updatedAt: clock.now(),
            };
            await repository.saveCollection(record);
        }

        ({ dimensions } = outcome);
    }

    signal.throwIfAborted();

    if (!await lock.renew()) {
        return undefined;
    }

    const current = await isSameCollection(input, record);

    if (!current || current.pending?.generation !== target) {
        return undefined;
    }

    const previous = current.generation;
    const switched = settled(current);

    // the previous model's length never carries over
    delete switched.dimensions;

    const next: KnowledgeCollection = {
        ...switched,
        generation: target,
        model,
        ...(dimensions === undefined ? {} : { dimensions }),
        chunker: CHUNKER_VERSION,
        status: 'ready',
        updatedAt: clock.now(),
    };

    await repository.saveCollection(next);

    if (previous > 0) {
        await repository.deleteGeneration(name, previous);
    }

    return next;
}

/**
 * One pass over a managed collection. Re-reads the record (missing or no
 * longer managed: nothing to do). A stale record (another default model or
 * chunker) is re-embedded first when `reembed` asks for it or the record
 * names that re-embed as pending (see `reembed`). Then every `pending`
 * document, in id order, is embedded at the served generation and model
 * (see `embedOne`); a stale record whose served model is not available here
 * keeps them pending until a re-embed. The record itself is written only by
 * a re-embed.
 */
export async function syncManaged(input: SyncManagedInput): Promise<void> {
    const {
        name,
        repository,
        signal,
        lock,
    } = input;
    let record = await repository.findOneCollection(name);

    if (record?.kind !== 'managed') {
        return;
    }

    if (needsReembed(record, input.model) && (input.reembed || record.pending?.model === input.model)) {
        record = await reembed(input, record, input.model);

        if (!record) {
            return;
        }
    }

    if (!input.hasModel(record.model)) {
        return;
    }

    let { dimensions } = record;
    // a document whose hash this pass already embedded, if it is still pending, is passed over
    const attempted = new Set<string>();
    let offset = 0;

    for (;;) {
        signal.throwIfAborted();

        const { data } = await repository.findDocuments(name, {
            status: 'pending',
            limit: MANAGED_PAGE_SIZE,
            offset,
        });

        if (data.length === 0) {
            return;
        }

        for (const document of data) {
            const key = `${document.id}\0${document.hash}`;

            if (attempted.has(key)) {
                offset++;

                continue;
            }

            attempted.add(key);

            if (!await lock.renew()) {
                return;
            }

            const outcome = await embedOne(input, record, document, record.model, record.generation, dimensions);

            if (outcome.stop) {
                return;
            }

            ({ dimensions } = outcome);
        }
    }
}
