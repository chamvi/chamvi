/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MockTranscriptionModelV4 } from 'ai/test';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { IEngine, IModelResolver } from '@chamvi/core';
import { resolveTranscriptionModelRef } from '../../../src/model/module.ts';
import { createTestEngine } from '../../utils/engine.ts';

const engines: IEngine[] = [];

afterEach(() => {
    for (const engine of engines) {
        engine.stop();
    }

    engines.length = 0;
});

function transcriptionResolver(model: MockTranscriptionModelV4): IModelResolver & { calls: string[] } {
    const calls: string[] = [];

    return {
        calls,
        check() {},
        resolve() {
            throw new Error('no language models');
        },
        transcription(ref: string) {
            calls.push(ref);

            if (ref !== 'stt/turbo') {
                throw new Error(`unknown model ${ref}`);
            }

            return model;
        },
    };
}

describe('resolveTranscriptionModelRef()', () => {
    it('returns a TranscriptionModel object as given', () => {
        const model = new MockTranscriptionModelV4();
        const models = transcriptionResolver(new MockTranscriptionModelV4());

        expect(resolveTranscriptionModelRef(models, model)).toBe(model);
        expect(resolveTranscriptionModelRef(undefined, model)).toBe(model);
        expect(models.calls).toEqual([]);
    });

    it('resolves a string through models.transcription()', () => {
        const model = new MockTranscriptionModelV4();
        const models = transcriptionResolver(model);

        expect(resolveTranscriptionModelRef(models, 'stt/turbo')).toBe(model);
        expect(models.calls).toEqual(['stt/turbo']);
    });

    it('refuses a string without a resolver', () => {
        expect(() => resolveTranscriptionModelRef(undefined, 'stt/turbo')).toThrow(InvalidAgentDefinitionError);
        expect(() => resolveTranscriptionModelRef(undefined, 'stt/turbo')).toThrow(/needs a model resolver/);
    });

    it('refuses a resolver without transcription()', () => {
        const models: IModelResolver = {
            check() {},
            resolve() {
                throw new Error('no language models');
            },
        };

        expect(() => resolveTranscriptionModelRef(models, 'stt/turbo')).toThrow(InvalidAgentDefinitionError);
        expect(() => resolveTranscriptionModelRef(models, 'stt/turbo')).toThrow(/no transcription models/);
    });

    it('wraps a resolver failure, also a non-Error throw', () => {
        const models = transcriptionResolver(new MockTranscriptionModelV4());

        expect(() => resolveTranscriptionModelRef(models, 'stt/other')).toThrow(InvalidAgentDefinitionError);
        expect(() => resolveTranscriptionModelRef(models, 'stt/other')).toThrow(/unknown model stt\/other/);

        const throwing: IModelResolver = {
            check() {},
            resolve() {
                throw new Error('no language models');
            },
            transcription() {
                // eslint-disable-next-line no-throw-literal
                throw 'offline';
            },
        };

        expect(() => resolveTranscriptionModelRef(throwing, 'stt/turbo')).toThrow(InvalidAgentDefinitionError);
        expect(() => resolveTranscriptionModelRef(throwing, 'stt/turbo')).toThrow(/offline/);
    });
});

describe('engine.resolveTranscriptionModel()', () => {
    it('engine.resolveTranscriptionModel() uses EngineOptions.models', () => {
        const model = new MockTranscriptionModelV4();
        const models = transcriptionResolver(model);
        const engine = createTestEngine({ models });

        engines.push(engine);

        expect(engine.resolveTranscriptionModel('stt/turbo')).toBe(model);
        expect(models.calls).toEqual(['stt/turbo']);
    });
});
