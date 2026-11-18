/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mockEmbeddingModel } from '@chamvi/test-kit';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { IKnowledge, KnowledgeCollection, KnowledgeOptions } from '@chamvi/knowledge';
import { KNOWLEDGE_MANAGED_POLL_MS, contentHash, createKnowledge } from '@chamvi/knowledge';
import type { IndexerSetup } from '../../utils/indexer.ts';
import { createIndexerSetup } from '../../utils/indexer.ts';

const created: IKnowledge[] = [];

afterEach(async () => {
    await Promise.all(created.splice(0).map(async (knowledge) => {
        await knowledge.managedPoll.stop();
        await knowledge.stop();
    }));
});

type PollSetup = IndexerSetup & {
    /** The calls of `findCollections()` (the orphan pass reads it once per start too). */
    reads: number;
    /** Makes the next `findCollections()` wait until the returned release is called. */
    hold(): () => void;
};

function createPollSetup(): PollSetup {
    const setup = createIndexerSetup();
    const { repository } = setup;
    const find = repository.findCollections.bind(repository);
    let held: Promise<void> | undefined;
    const poll = Object.assign(setup, {
        reads: 0,
        hold: () => {
            const { promise, resolve } = Promise.withResolvers<void>();

            held = promise;

            return () => resolve();
        },
    });

    repository.findCollections = async () => {
        poll.reads++;

        const gate = held;

        held = undefined;
        await gate;

        return find();
    };

    return poll;
}

function create(setup: IndexerSetup, extra: Partial<KnowledgeOptions> = {}): IKnowledge {
    const knowledge = createKnowledge(setup.options({ embeddingModel: mockEmbeddingModel(), ...extra }));

    created.push(knowledge);

    return knowledge;
}

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
}

/** A managed collection with one pending document, as another instance left it. */
async function seedPending(setup: IndexerSetup): Promise<void> {
    const record: KnowledgeCollection = {
        name: 'notes',
        kind: 'managed',
        trusted: false,
        model: 'mock-provider/mock-model-id',
        chunker: 'text-v1',
        status: 'ready',
        generation: 1,
        lastGeneration: 1,
        createdAt: new Date(setup.clock.now()),
        updatedAt: new Date(setup.clock.now()),
    };

    await setup.repository.saveCollection(record);
    await setup.repository.saveDocument({
        collection: 'notes',
        id: 'doc',
        content: 'Refunds within thirty days.',
        hash: contentHash('Refunds within thirty days.'),
        status: 'pending',
        generation: 0,
        updatedAt: new Date(setup.clock.now()),
    });
}

async function documentStatus(setup: IndexerSetup): Promise<string | undefined> {
    return (await setup.repository.findOneDocument('notes', 'doc'))?.status;
}

describe('the managed poll (createKnowledge() runs it)', () => {
    it('runs its first pass at once: a stored managed collection gets its loop', async () => {
        const setup = createPollSetup();

        await seedPending(setup);

        const knowledge = create(setup);

        knowledge.start();

        await vi.waitFor(async () => {
            expect(await documentStatus(setup)).toBe('ready');
        });
        expect(knowledge.managedPoll.status().lastSuccessAt).toBe(setup.clock.now());
        expect(setup.errors).toEqual([]);
    });

    it('runs the next pass KNOWLEDGE_MANAGED_POLL_MS after the last one', async () => {
        const setup = createPollSetup();
        const knowledge = create(setup);
        const startedAt = setup.clock.now();

        knowledge.start();
        await settle();

        expect(knowledge.managedPoll.status().lastRunAt).toBe(startedAt);

        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS - 1);
        await settle();

        expect(knowledge.managedPoll.status().lastRunAt).toBe(startedAt);

        setup.clock.advance(1);
        await settle();

        expect(knowledge.managedPoll.status().lastRunAt).toBe(startedAt + KNOWLEDGE_MANAGED_POLL_MS);
    });

    it('reports a failed pass and tries again at the next poll', async () => {
        const setup = createPollSetup();
        const knowledge = create(setup);
        const { repository } = setup;
        const find = repository.findCollections;
        let fail = true;

        repository.findCollections = async () => {
            // the orphan pass reads first; the poll's read fails once
            if (fail && setup.reads === 1) {
                fail = false;
                setup.reads++;

                throw new Error('store down');
            }

            return find();
        };

        knowledge.start();
        await settle();

        expect(setup.errors).toEqual([{ error: new Error('store down') }]);
        expect(knowledge.managedPoll.status().lastErrorAt).toBe(setup.clock.now());

        await seedPending(setup);
        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

        await vi.waitFor(async () => {
            expect(await documentStatus(setup)).toBe('ready');
        });
        expect(setup.errors).toHaveLength(1);
    });

    it('a stop aborts a pass in flight: it starts no loop and reports nothing, and the stop waits for it', async () => {
        const setup = createPollSetup();
        const knowledge = create(setup);

        await seedPending(setup);

        // the orphan pass reads first, unheld; the poll's read waits
        const find = setup.repository.findCollections;
        let release: (() => void) | undefined;

        setup.repository.findCollections = () => {
            if (setup.reads === 1) {
                release = setup.hold();
            }

            return find();
        };

        knowledge.start();
        await settle();

        expect(release).toBeTypeOf('function');
        expect(knowledge.managedPoll.status().runningSince).toBe(setup.clock.now());

        let stopped = false;
        const stopping = knowledge.stop().then(() => {
            stopped = true;
        });

        await settle();

        expect(stopped).toBe(false);

        release!();
        await stopping;

        await settle();

        expect(await documentStatus(setup)).toBe('pending');
        expect(setup.errors).toEqual([]);
    });

    it('a restart waits for the previous stop: the next pass begins once the stopped one settled', async () => {
        const setup = createPollSetup();
        const knowledge = create(setup);
        const find = setup.repository.findCollections;
        let release: (() => void) | undefined;

        setup.repository.findCollections = () => {
            if (setup.reads === 1) {
                release = setup.hold();
            }

            return find();
        };

        knowledge.start();
        await settle();

        const stopping = knowledge.stop();

        knowledge.start();
        await settle();

        // the poll's read is still held: neither the new orphan pass nor a new poll began
        expect(setup.reads).toBe(2);

        release!();
        await stopping;
        await settle();

        // the restart's orphan pass and its first poll
        expect(setup.reads).toBe(4);

        await seedPending(setup);
        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

        await vi.waitFor(async () => {
            expect(await documentStatus(setup)).toBe('ready');
        });
    });
});

describe('the managed poll run by its owner (runManagedPoll: false)', () => {
    it('start() and stop() leave the poll alone', async () => {
        const setup = createPollSetup();
        const knowledge = create(setup, { runManagedPoll: false });

        knowledge.start();
        await settle();
        await knowledge.stop();

        expect(knowledge.managedPoll.status()).toEqual({});
        // the orphan pass only
        expect(setup.reads).toBe(1);
    });

    it('a pass while the instance is not indexing does nothing', async () => {
        const setup = createPollSetup();

        await seedPending(setup);

        const knowledge = create(setup, { runManagedPoll: false });

        await knowledge.managedPoll.start();

        expect(setup.reads).toBe(0);
        expect(knowledge.managedPoll.status().lastSuccessAt).toBe(setup.clock.now());

        knowledge.start();
        await settle();

        // the orphan pass read the list; no loop embeds the pending document before the next poll
        expect(setup.reads).toBe(1);
        expect(await documentStatus(setup)).toBe('pending');

        setup.clock.advance(KNOWLEDGE_MANAGED_POLL_MS);

        await vi.waitFor(async () => {
            expect(await documentStatus(setup)).toBe('ready');
        });
    });

    it('a stop of the component aborts the pass in flight', async () => {
        const setup = createPollSetup();

        await seedPending(setup);

        const knowledge = create(setup, { runManagedPoll: false });

        knowledge.start();
        await settle();

        const release = setup.hold();
        const started = knowledge.managedPoll.start();

        await settle();

        expect(knowledge.managedPoll.status().runningSince).toBe(setup.clock.now());

        await knowledge.managedPoll.stop();
        release();
        await started;
        await knowledge.managedPoll.settled?.();
        await settle();

        // indexing still runs, but the aborted pass started no loop
        expect(await documentStatus(setup)).toBe('pending');
        expect(setup.errors).toEqual([]);
    });

    it('a stop of the indexing aborts the pass in flight too', async () => {
        const setup = createPollSetup();

        await seedPending(setup);

        const knowledge = create(setup, { runManagedPoll: false });

        knowledge.start();
        await settle();

        const release = setup.hold();
        const started = knowledge.managedPoll.start();

        await settle();
        await knowledge.stop();
        release();
        await started;
        await settle();

        expect(await documentStatus(setup)).toBe('pending');
        expect(setup.errors).toEqual([]);
    });
});
