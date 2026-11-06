/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ErrorCode, InvalidRunStateError } from '@chamvi/core';
import {
    attachmentIds,
    createRunArtifacts,
    keyedArtifactId,
    storeArtifact,
} from '../../../src/artifact/module.ts';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';

const run = { id: 'run-1', agent: 'vision' };
const input = (text: string) => ({
    mediaType: 'text/plain',
    filename: `${text}.txt`,
    data: new TextEncoder().encode(text),
});

describe('storeArtifact', () => {
    it('returns the stored artifact when the run already holds the id', async () => {
        const store = createMemoryStore();
        const first = await storeArtifact(store.artifacts, run, input('first'), new Date(1), 'run-1.0000');
        const second = await storeArtifact(store.artifacts, run, input('second!'), new Date(2), 'run-1.0000');

        expect(second).toEqual(first);
        expect(await store.artifacts.find('run-1')).toEqual([first]);
        expect(new TextDecoder().decode(await store.artifacts.read('run-1.0000'))).toBe('first');
    });

    it('throws InvalidRunStateError when another run holds the id', async () => {
        const store = createMemoryStore();

        await storeArtifact(store.artifacts, { id: 'run-2', agent: 'vision' }, input('x'), new Date(1), 'taken');

        const promise = storeArtifact(store.artifacts, run, input('y'), new Date(1), 'taken');

        await expect(promise).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(promise).rejects.toMatchObject({ code: ErrorCode.INVALID_RUN_STATE });
    });

    it('gives tool artifacts random ids', async () => {
        const clock = new ControllableClock(new Date(1));
        const artifacts = createRunArtifacts(createMemoryStore({ clock }).artifacts, run, clock);
        const a = await artifacts.put(input('a'));
        const b = await artifacts.put(input('b'));

        expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(a.createdAt).toEqual(clock.now());
        expect(b.id).not.toBe(a.id);
    });
});

describe('attachmentIds', () => {
    it('pads the index to at least 4 digits', () => {
        expect(attachmentIds('r', 2)).toEqual(['r.0000', 'r.0001']);
        expect(attachmentIds('r', 0)).toEqual([]);
    });

    it('widens every index of a dispatch when the count needs it', () => {
        const ids = attachmentIds('r', 10_001);

        expect(ids[0]).toBe('r.00000');
        expect(ids.at(-1)).toBe('r.10000');
        expect([...ids].sort()).toEqual(ids);
    });
});

describe('UUID v7 artifact identities', () => {
    const runId = '019a5555-1234-7abc-8123-456789abcdef';
    const otherRun = '019a5555-1234-7abc-8123-456789abcdee';
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('keeps persisted deterministic identities stable', () => {
        expect(attachmentIds(runId, 2)).toEqual([
            '019a5555-1234-74ff-bd11-f8fe4941f877',
            '019a5555-1234-74ff-bd11-f8fe4941f878',
        ]);
        expect(keyedArtifactId(runId, 'report')).toBe('019a5555-1234-7bea-9dda-a3edb3db78f1');
    });

    it('keeps attachment ids stable across counts and ordered', () => {
        const ids = attachmentIds(runId, 10_001);

        expect(attachmentIds(runId, 2)).toEqual(ids.slice(0, 2));
        expect(attachmentIds(runId, 0)).toEqual([]);
        expect(attachmentIds(runId, ids.length)).toEqual(ids);
        expect([...ids].sort()).toEqual(ids);
        expect(new Set(ids).size).toBe(ids.length);

        for (const id of ids) {
            expect(id).toMatch(pattern);
            expect(id.slice(0, 13)).toBe(runId.slice(0, 13));
        }
    });

    it('includes the whole run id and distinguishes keys from attachments', () => {
        const a = attachmentIds(runId, 2);
        const b = attachmentIds(otherRun, 2);
        const keyed = [keyedArtifactId(runId, '0'), keyedArtifactId(runId, '1')];

        expect(new Set([...a, ...b, ...keyed]).size).toBe(6);
        expect(keyedArtifactId(runId, '0')).toBe(keyed[0]);
        expect(keyedArtifactId(otherRun, '0')).not.toBe(keyed[0]);

        for (const id of keyed) {
            expect(id).toMatch(pattern);
            expect(id.slice(0, 13)).toBe(runId.slice(0, 13));
        }
    });
});
