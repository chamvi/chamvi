/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { NoSuchModelError } from 'ai';
import { MockTranscriptionModelV4 } from 'ai/test';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { createModelResolver } from '../../../src/models/resolver.ts';
import { readModelSettings } from '../../../src/models/settings/index.ts';
import type { ModelSettings } from '../../../src/models/types.ts';

/**
 * An importer whose `@ai-sdk/openai` factory returns a provider that records
 * every `transcriptionModel` call; an id outside `known` throws
 * NoSuchModelError, as the AI SDK's providers do. With `known` undefined the
 * provider has no `transcriptionModel` at all.
 */
function transcriptionImporter(known?: Record<string, MockTranscriptionModelV4 | Error>) {
    const calls: string[] = [];
    const importer = async (specifier: string): Promise<unknown> => {
        if (specifier !== '@ai-sdk/openai') {
            const error = new Error(`Cannot find package '${specifier}'`);

            (error as Error & { code: string }).code = 'ERR_MODULE_NOT_FOUND';

            throw error;
        }

        const provider: Record<string, unknown> = {
            languageModel: (modelId: string) => {
                throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
            },
            embeddingModel: (modelId: string) => {
                throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
            },
        };

        if (known) {
            provider.transcriptionModel = (modelId: string) => {
                calls.push(modelId);

                const model = known[modelId];

                if (!model) {
                    throw new NoSuchModelError({ modelId, modelType: 'transcriptionModel' });
                }

                if (Error.isError(model)) {
                    throw model;
                }

                return model;
            };
        }

        return { createOpenAI: () => provider };
    };

    return { importer, calls };
}

function errorOf(fn: () => unknown): Error {
    try {
        fn();
    } catch (error) {
        return error as Error;
    }

    throw new Error('expected a throw');
}

const STT_ENV = {
    CHAMVI_PROVIDER_STT_TYPE: 'openai',
    CHAMVI_PROVIDER_STT_BASE_URL: 'http://whisper:8000/v1',
    CHAMVI_PROVIDER_STT_API_KEY: 'k',
};

describe('createModelResolver: transcription()', () => {
    let cwd: string;

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'chamvi-resolver-transcription-'));
    });

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true });
    });

    async function settingsOf(env: Record<string, string | undefined>): Promise<ModelSettings> {
        const { settings, issues } = await readModelSettings({ env, cwd });

        expect(issues).toEqual([]);

        return settings;
    }

    it('returns the provider\'s transcriptionModel(id)', async () => {
        const whisper = new MockTranscriptionModelV4();
        const fake = transcriptionImporter({ whisper });
        const resolver = await createModelResolver(await settingsOf(STT_ENV), { importer: fake.importer });

        expect(resolver.transcription('stt/whisper')).toBe(whisper);
        expect(fake.calls).toEqual(['whisper']);
    });

    it('refuses an id the provider does not know', async () => {
        const fake = transcriptionImporter({});
        const resolver = await createModelResolver(await settingsOf(STT_ENV), { importer: fake.importer });

        const error = errorOf(() => resolver.transcription('stt/x'));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toBe('Provider "stt" offers no transcription model "x".');
    });

    it('refuses a provider without transcriptionModel()', async () => {
        const fake = transcriptionImporter();
        const resolver = await createModelResolver(await settingsOf(STT_ENV), { importer: fake.importer });

        const error = errorOf(() => resolver.transcription('stt/x'));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toBe('Provider "stt" offers no transcription model "x".');
    });

    it('keeps other failures', async () => {
        const failure = new Error('boom');
        const fake = transcriptionImporter({ broken: failure });
        const resolver = await createModelResolver(await settingsOf(STT_ENV), { importer: fake.importer });

        expect(errorOf(() => resolver.transcription('stt/broken'))).toBe(failure);
    });

    it('refuses an unconfigured provider with the message resolve() throws', async () => {
        const resolver = await createModelResolver(await settingsOf({}), { importer: transcriptionImporter({}).importer });

        const resolveError = errorOf(() => resolver.resolve('stt/m'));
        const transcriptionError = errorOf(() => resolver.transcription('stt/m'));

        expect(transcriptionError).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(transcriptionError.message).toBe(resolveError.message);
    });
});
