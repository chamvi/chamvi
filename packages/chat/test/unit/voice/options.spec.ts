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
import { Chat } from 'chat';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import {
    CHAT_VOICE_LABEL,
    CHAT_VOICE_MAX_BYTES,
    CHAT_VOICE_MAX_SECONDS,
    CHAT_VOICE_TIMEOUT_MS,
    createChatIngressAdapter,
} from '@chamvi/chat';
import type { ChatChannelOptions } from '@chamvi/chat';
import { resolveOptions } from '../../../src/channel/helpers.ts';
import { createFakeAdapter } from '../../utils/adapter.ts';
import { createMemoryState, createRecordingLogger } from '../../utils/chat.ts';
import { createIntakeFixture } from '../../utils/intake.ts';
import { transcriptionModel } from '../../utils/model.ts';

/** resolveOptions() over a fresh Chat and adapter, with `voice` */
function resolveVoice(voice: unknown) {
    const ingress = createChatIngressAdapter(createFakeAdapter());
    const chat = new Chat({
        userName: 'chamvi',
        adapters: { fake: ingress },
        state: createMemoryState(),
        logger: createRecordingLogger(),
    });

    return resolveOptions({
        chat,
        adapters: [ingress],
        allowMessage: () => true,
        voice: voice as ChatChannelOptions['voice'],
    }).voice;
}

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

describe('voice option', () => {
    it('is off without voice', () => {
        expect(resolveVoice(undefined)).toBeUndefined();
    });

    it('fills the defaults', () => {
        expect(resolveVoice({ model: 'stt/turbo' })).toEqual({
            model: 'stt/turbo',
            maxBytes: 10 * 1024 * 1024,
            maxSeconds: 300,
            timeoutMs: 60_000,
            label: '[Voice message] ',
        });
        expect(CHAT_VOICE_MAX_BYTES).toBe(10 * 1024 * 1024);
        expect(CHAT_VOICE_MAX_SECONDS).toBe(300);
        expect(CHAT_VOICE_TIMEOUT_MS).toBe(60_000);
        expect(CHAT_VOICE_LABEL).toBe('[Voice message] ');
    });

    it('keeps given values and a TranscriptionModel', () => {
        const model = transcriptionModel('hi');

        expect(resolveVoice({
            model,
            maxBytes: 1024,
            maxSeconds: 30,
            timeoutMs: 5_000,
            label: '',
        })).toEqual({
            model,
            maxBytes: 1024,
            maxSeconds: 30,
            timeoutMs: 5_000,
            label: '',
        });
    });

    it.each([
        ['voice', 'stt/turbo'],
        ['voice.model', {}],
        ['voice.model', { model: '' }],
        ['voice.model', { model: 42 }],
        ['voice.maxBytes', { model: 'stt/turbo', maxBytes: 0 }],
        ['voice.maxBytes', { model: 'stt/turbo', maxBytes: 1.5 }],
        ['voice.maxSeconds', { model: 'stt/turbo', maxSeconds: 0 }],
        ['voice.timeoutMs', { model: 'stt/turbo', timeoutMs: 2 ** 31 }],
        ['voice.label', { model: 'stt/turbo', label: 1 }],
    ])('refuses an invalid %s', (field, voice) => {
        expect(() => resolveVoice(voice)).toThrow(InvalidAgentDefinitionError);
        expect(() => resolveVoice(voice)).toThrow(field);
    });

    it('fails the start when the engine cannot resolve the model', async () => {
        const fixture = createIntakeFixture({
            agents: () => [],
            patch: { voice: { model: 'stt/turbo' } },
        });

        engines.push(fixture.engine);

        await expect(fixture.engine.start()).rejects.toThrow(InvalidAgentDefinitionError);
    });

    it('resolves a model string once on start', async () => {
        const model = transcriptionModel('hi');
        const refs: string[] = [];
        const fixture = createIntakeFixture({
            agents: () => [],
            patch: { voice: { model: 'stt/turbo' } },
            models: {
                check: () => {},
                resolve: () => {
                    throw new Error('not used');
                },
                transcription: (ref) => {
                    refs.push(ref);

                    return model;
                },
            },
        });

        engines.push(fixture.engine);
        await fixture.engine.start();

        expect(refs).toEqual(['stt/turbo']);
    });
});
