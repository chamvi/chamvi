/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ErrorCode } from '@chamvi/errors';
import { describe, expect, it } from 'vitest';
import { MemoryArtifactRepository, MemoryRegistry } from '@chamvi/store-memory';
import { InvalidRunStateError } from '@chamvi/core';
import { createRunArtifacts, storeArtifact } from '../../../src/artifact/module.ts';
import { ArtifactService } from '../../../src/artifact/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { createTestServices } from '../../utils/engine.ts';

const run = { id: 'run-1', agent: 'vision' };
const input = (text: string) => ({
    mediaType: 'text/plain',
    filename: `${text}.txt`,
    data: new TextEncoder().encode(text),
});

describe('storeArtifact', () => {
    it('returns the stored artifact when the run already holds the key', async () => {
        const store = createTestServices();
        const first = await storeArtifact(store.artifactService, run, input('first'), new Date(1), 'attachment:0');
        const second = await storeArtifact(store.artifactService, run, input('second!'), new Date(2), 'attachment:0');

        expect(second).toEqual(first);
        expect(await store.artifactService.find('run-1')).toEqual([first]);
        expect(new TextDecoder().decode(await store.artifactService.read(first.id))).toBe('first');
    });

    it.each([
        ['an unkeyed lost race', undefined],
        ['a keyed lost race whose row is absent', 'attachment:0'],
    ])('throws InvalidRunStateError on %s', async (_, key) => {
        const store = new class extends ArtifactService {
            override async create(): Promise<boolean> {
                return false;
            }
        }({ repository: new MemoryArtifactRepository({ registry: new MemoryRegistry() }) });
        const promise = storeArtifact(store, run, input('y'), new Date(1), key);

        await expect(promise).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(promise).rejects.toMatchObject({ code: ErrorCode.INVALID_RUN_STATE });
    });

    it('gives tool artifacts random ids', async () => {
        const clock = new ControllableClock(new Date(1));
        const artifacts = createRunArtifacts(createTestServices({ clock }).artifactService, run, clock);
        const a = await artifacts.put(input('a'));
        const b = await artifacts.put(input('b'));

        expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(b.id).not.toBe(a.id);
    });
});
