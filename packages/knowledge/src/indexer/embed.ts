/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { chunkText } from '../chunk/module.ts';
import type { KnowledgeChunkInput } from '../store/types.ts';
import { EMBED_BATCH_SIZE } from './constants.ts';
import { assertVectors } from './helpers/index.ts';
import type { EmbedDocumentInput, EmbeddedDocument } from './types.ts';

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
