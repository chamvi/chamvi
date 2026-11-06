/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    createRunArtifacts,
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
        const first = await storeArtifact(store.artifacts, run, input('first'), new Date(1), 'attachment:0');
        const second = await storeArtifact(store.artifacts, run, input('second!'), new Date(2), 'attachment:0');

        expect(second).toEqual(first);
        expect(await store.artifacts.find(run.id)).toEqual([first]);
        expect(new TextDecoder().decode(await store.artifacts.read(first.id))).toBe('first');
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
