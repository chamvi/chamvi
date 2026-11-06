/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { 
    afterEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import {
    Engine,
    ValidationError,
    defineModelAgent,
} from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import { createRunArtifacts } from '../../../src/artifact/module.ts';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

const RUN = { id: '019a5555-1234-7abc-8123-456789abcdef', agent: 'a' };

function setup() {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = createMemoryStore({ clock });
    const artifacts = createRunArtifacts(store.artifacts, RUN, clock);

    return {
        clock, 
        store, 
        artifacts, 
    };
}

describe('keyed artifacts', () => {
    it('refuses a put with a bad mediaType or non-Uint8Array data and stores nothing', async () => {
        const { store, artifacts } = setup();

        await expect(artifacts.put({ mediaType: 'nope', data: new Uint8Array([1]) })).rejects.toThrow(ValidationError);
        await expect(artifacts.put({
            key: 'k',
            mediaType: 'nope',
            data: new Uint8Array([1]),
        })).rejects.toThrow(ValidationError);
        await expect(artifacts.put({ mediaType: 'text/plain', data: [1] as unknown as Uint8Array })).rejects.toThrow(ValidationError);
        await expect(artifacts.put({
            key: 'k',
            mediaType: 'text/plain',
            data: 'text' as unknown as Uint8Array,
        })).rejects.toThrow(ValidationError);
        expect(await store.artifacts.find(RUN.id)).toHaveLength(0);
    });

    it('stores a UUID id while keeping its storage key private', async () => {
        const { artifacts } = setup();
        const artifact = await artifacts.put({
            key: 'vr/button/actual', 
            mediaType: 'image/png', 
            data: new Uint8Array([1]), 
        });

        expect(artifact.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(artifact).not.toHaveProperty('key');
    });

    it('replaces the artifact on a put with the same key', async () => {
        const { clock, artifacts } = setup();
        const first = await artifacts.put({
            key: 'k',
            mediaType: 'image/png',
            filename: 'a.png',
            data: new Uint8Array([1, 2]),
        });

        clock.advance(1_000);

        const second = await artifacts.put({
            key: 'k', 
            mediaType: 'image/jpeg', 
            data: new Uint8Array([9]), 
        });

        expect(second.id).toBe(first.id);
        expect(second.createdAt).toEqual(first.createdAt);
        expect(second.mediaType).toBe('image/jpeg');
        expect(second.filename).toBeUndefined();

        const got = await artifacts.get(first.id);

        expect(Array.from(got!.data)).toEqual([9]);
        expect(await artifacts.list()).toHaveLength(1);
    });

    it('keeps random ids for a put without a key', async () => {
        const { artifacts } = setup();
        const a = await artifacts.put({ mediaType: 'text/plain', data: new Uint8Array([1]) });
        const b = await artifacts.put({ mediaType: 'text/plain', data: new Uint8Array([1]) });

        expect(a.id).not.toBe(b.id);
        expect(await artifacts.list()).toHaveLength(2);
    });

    it('two parallel puts of one key leave one artifact', async () => {
        const { artifacts } = setup();
        const [a, b] = await Promise.all([
            artifacts.put({
                key: 'k', 
                mediaType: 'text/plain', 
                data: new Uint8Array([1]), 
            }),
            artifacts.put({
                key: 'k', 
                mediaType: 'text/plain', 
                data: new Uint8Array([2]), 
            }),
        ]);

        expect(a.id).toBe(b.id);
        expect(await artifacts.list()).toHaveLength(1);
    });

    it.each([
        ['an empty key', ''],
        ['a key over 255 characters', 'x'.repeat(256)],
        ['a key with a NUL', 'a\0b'],
        ['a key with a lone surrogate', 'a\ud800b'],
        ['a non-string key', 42],
    ])('refuses %s', async (_, key) => {
        const { artifacts, store } = setup();

        await expect(artifacts.put({
            key, 
            mediaType: 'text/plain', 
            data: new Uint8Array([1]), 
        } as never))
            .rejects.toBeInstanceOf(ValidationError);
        expect(await store.artifacts.find(RUN.id)).toEqual([]);
    });

    it('accepts a key of 255 characters', async () => {
        const { artifacts } = setup();

        await expect(artifacts.put({
            key: 'x'.repeat(255), 
            mediaType: 'text/plain', 
            data: new Uint8Array([1]), 
        }))
            .resolves.toHaveProperty('id');
    });

    it('refuses a dispatch attachment with a key', async () => {
        const clock = new ControllableClock(new Date(1_000_000));
        const store = createMemoryStore({ clock });
        const engine = new Engine({
            store,
            clock,
            agents: [defineModelAgent({
                name: 'vision', 
                instructions: 'x', 
                model: mockModel([]), 
            })],
        });

        engines.push(engine);

        await expect(engine.dispatch({
            agent: 'vision',
            trigger: 'http',
            channel: 'http',
            payload: {},
            attachments: [{
                key: 'k', 
                mediaType: 'text/plain', 
                data: new Uint8Array([1]), 
            }],
        })).rejects.toThrow('Attachments take no key.');
        expect((await store.runs.find({})).data).toEqual([]);
    });
});
