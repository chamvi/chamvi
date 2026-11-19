/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { KnowledgeDocument, KnowledgeDocumentInput } from '@chamvi/knowledge';
import { sameDetails, sameOrigin } from '../../../src/indexer/helpers.ts';

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

    it('treats NUL and lone surrogates as the U+FFFD a store may keep in their place', () => {
        const dirty = 'a\0b\uD800c';
        const clean = 'a\uFFFDb\uFFFDc';

        expect(sameDetails(
            {
                ...stored({ [clean]: clean }), 
                title: clean, 
                source: clean, 
            },
            {
                ...input({ [dirty]: dirty }), 
                title: dirty, 
                source: dirty, 
            },
        )).toBe(true);
        expect(sameOrigin({ ...stored({}), title: clean }, { ...input({}), title: 'a\uFFFDb\uFFFDd' })).toBe(false);
        expect(sameDetails(stored({ k: clean }), input({ k: 'other' }))).toBe(false);
    });
});
