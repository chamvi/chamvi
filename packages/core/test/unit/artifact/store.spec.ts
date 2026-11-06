/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ErrorCode, InvalidRunStateError, ValidationError } from '@chamvi/core';
import {
    attachmentIds,
    createRunArtifacts,
    keyedArtifactId,
    storeArtifact,
} from '../../../src/artifact/module.ts';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';

const run = { id: '019a5555-1234-7abc-8123-456789abcdef', agent: 'vision' };
const input = (text: string) => ({
    mediaType: 'text/plain',
    filename: `${text}.txt`,
    data: new TextEncoder().encode(text),
});

describe('storeArtifact', () => {
    it('returns the stored artifact when the run already holds the id', async () => {
        const store = createMemoryStore();
        const first = await storeArtifact(store.artifacts, run, input('first'), new Date(1), '019a5555-1234-74ff-bd11-f8fe4941f877');
        const second = await storeArtifact(store.artifacts, run, input('second!'), new Date(2), '019a5555-1234-74ff-bd11-f8fe4941f877');

        expect(second).toEqual(first);
        expect(await store.artifacts.find(run.id)).toEqual([first]);
        expect(new TextDecoder().decode(await store.artifacts.read('019a5555-1234-74ff-bd11-f8fe4941f877'))).toBe('first');
    });

    it('throws InvalidRunStateError when another run holds the id', async () => {
        const store = createMemoryStore();

        await storeArtifact(store.artifacts, { id: '019a5555-1234-7abc-8123-456789abcdee', agent: 'vision' }, input('x'), new Date(1), '019a5555-1234-74ff-bd11-f8fe4941f878');

        const promise = storeArtifact(store.artifacts, run, input('y'), new Date(1), '019a5555-1234-74ff-bd11-f8fe4941f878');

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

describe('UUID v7 artifact identities', () => {
    const runId = '019a5555-1234-7abc-8123-456789abcdef';
    const otherRun = '019a5555-1234-7abc-8123-456789abcdee';
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('rejects malformed run ids', () => {
        expect(() => attachmentIds('r', 1)).toThrow(ValidationError);
        expect(() => keyedArtifactId('r', 'key')).toThrow(ValidationError);
    });

    it('derives stable artifact identities', () => {
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
