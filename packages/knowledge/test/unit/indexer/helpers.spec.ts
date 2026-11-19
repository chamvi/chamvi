/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ControllableClock } from '@chamvi/test-kit';
import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { KnowledgeDocument, KnowledgeDocumentInput } from '@chamvi/knowledge';
import { KNOWLEDGE_LOCK_TTL_MS } from '@chamvi/knowledge';
import { createIndexLock, sameDetails } from '../../../src/indexer/helpers/index.ts';

function stored(metadata: Record<string, unknown>): KnowledgeDocument {
    return {
        collection: 'docs',
        id: 'a.md',
        content: 'text',
        hash: 'sha256:a',
        metadata,
        status: 'ready',
        generation: 1,
        updatedAt: new Date(0),
    };
}

function input(metadata: Record<string, unknown>): KnowledgeDocumentInput {
    return {
        id: 'a.md',
        content: 'text',
        metadata,
    };
}

describe('sameDetails', () => {
    it('compares metadata by value, key order aside', () => {
        expect(sameDetails(stored({ b: 1, a: { d: 2, c: 3 } }), input({ a: { c: 3, d: 2 }, b: 1 }))).toBe(true);
        expect(sameDetails(stored({ a: 1 }), input({ a: 2 }))).toBe(false);
    });

    it('compares boxed primitives by their primitive value', () => {
        /* eslint-disable no-new-wrappers */
        expect(sameDetails(stored({ n: new Number(1) }), input({ n: new Number(2) }))).toBe(false);
        expect(sameDetails(stored({ b: new Boolean(true) }), input({ b: new Boolean(false) }))).toBe(false);
        expect(sameDetails(stored({ s: new String('ab') }), input({ s: new String('cd') }))).toBe(false);
        expect(sameDetails(stored({ n: new Number(1) }), input({ n: 1 }))).toBe(true);
        /* eslint-enable no-new-wrappers */
    });

    it('sorts the keys of an object without a prototype', () => {
        const metadata = Object.assign(Object.create(null) as Record<string, unknown>, { b: 1, a: 2 });

        expect(sameDetails(stored({ a: 2, b: 1 }), input(metadata))).toBe(true);
    });
});

describe('createIndexLock', () => {
    const locksOf = (answers: boolean[]) => ({
        acquire: vi.fn(async () => 1),
        release: vi.fn(async () => {}),
        renew: vi.fn(async () => answers.shift() ?? false),
    });

    it('carries the acquired token and renews in place once half the TTL passed', async () => {
        const clock = new ControllableClock(new Date(0));
        const locks = locksOf([true, true]);
        const lock = createIndexLock(locks, 'knowledge:docs', 'owner', clock, 2 ** 52);

        expect(lock.token).toBe(2 ** 52);
        expect(await lock.renew()).toBe(true);
        expect(locks.renew).not.toHaveBeenCalled();

        clock.advance(KNOWLEDGE_LOCK_TTL_MS / 2);
        expect(await lock.renew()).toBe(true);
        // within half the TTL of the last renew: no store call
        expect(await lock.renew()).toBe(true);

        clock.advance(KNOWLEDGE_LOCK_TTL_MS / 2);
        expect(await lock.renew()).toBe(true);

        expect(locks.renew.mock.calls).toEqual([
            ['knowledge:docs', 'owner', KNOWLEDGE_LOCK_TTL_MS],
            ['knowledge:docs', 'owner', KNOWLEDGE_LOCK_TTL_MS],
        ]);
        expect(locks.acquire).not.toHaveBeenCalled();
        expect(locks.release).not.toHaveBeenCalled();
        expect(lock.token).toBe(2 ** 52);
        expect(lock.lost).toBe(false);
    });

    it('is lost for good once a renew answers false', async () => {
        const clock = new ControllableClock(new Date(0));
        const locks = locksOf([false]);
        const lock = createIndexLock(locks, 'knowledge:docs', 'owner', clock, 7);

        clock.advance(KNOWLEDGE_LOCK_TTL_MS / 2);

        expect(await lock.renew()).toBe(false);
        expect(lock.lost).toBe(true);
        expect(await lock.renew()).toBe(false);
        expect(locks.renew).toHaveBeenCalledTimes(1);
        expect(locks.acquire).not.toHaveBeenCalled();
        expect(locks.release).not.toHaveBeenCalled();
    });
});
