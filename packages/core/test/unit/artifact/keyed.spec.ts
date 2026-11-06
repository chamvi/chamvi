/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { 
    afterEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import {
    Engine,
    InvalidRunStateError,
    ValidationError,
    defineModelAgent,
    keyedArtifactId,
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

const RUN = { id: 'run-1', agent: 'a' };

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

    it('derives the id of a put with a key from run and key', async () => {
        const { artifacts } = setup();
        const artifact = await artifacts.put({
            key: 'vr/button/actual', 
            mediaType: 'image/png', 
            data: new Uint8Array([1]), 
        });
        const digest = createHash('sha256').update('vr/button/actual').digest('hex').slice(0, 32);

        expect(artifact.id).toBe(keyedArtifactId(RUN.id, 'vr/button/actual'));
        expect(artifact.id).toBe(`${RUN.id}.k.${digest}`);
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

    it.each([false, true])('reuses a stored legacy key for a UUID v7 run and checks ownership (foreign=%s)', async (foreign) => {
        const { clock, store } = setup();
        const run = { id: '019a5555-1234-7abc-8123-456789abcdef', agent: 'a' };
        const id = `${run.id}.k.${createHash('sha256').update('report').digest('hex').slice(0, 32)}`;
        const stored = {
            id,
            runId: foreign ? 'other-run' : run.id,
            agent: run.agent,
            mediaType: 'text/plain',
            filename: 'old.txt',
            size: 1,
            createdAt: clock.now(),
        };

        await store.artifacts.insert(stored, new Uint8Array([1]));
        clock.advance(1000);

        const artifacts = createRunArtifacts(store.artifacts, run, clock);
        const put = () => artifacts.put({
            key: 'report',
            mediaType: 'image/png',
            data: new Uint8Array([2, 3]),
        });

        if (foreign) {
            await expect(put()).rejects.toBeInstanceOf(InvalidRunStateError);
            expect(await store.artifacts.findOne(id)).toEqual(stored);
            expect(await store.artifacts.find(run.id)).toEqual([]);

            return;
        }

        const results = await Promise.all([put(), put()]);

        expect(results.map((item) => item.id)).toEqual([id, id]);
        expect(results[0]?.createdAt).toEqual(stored.createdAt);
        expect(results[0]?.mediaType).toBe('image/png');
        expect(results[0]?.filename).toBeUndefined();
        expect(await store.artifacts.read(id)).toEqual(new Uint8Array([2, 3]));
        expect(await artifacts.list()).toEqual([results[0]]);
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
            .resolves.toMatchObject({ id: keyedArtifactId(RUN.id, 'x'.repeat(255)) });
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

    it('never collides with attachment ids', () => {
        for (let i = 0; i < 500; i++) {
            expect(keyedArtifactId('run-1', `key-${i}`)).not.toMatch(/^.+\.\d{4,}$/);
        }
    });
});
