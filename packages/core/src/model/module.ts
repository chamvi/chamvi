/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel, TranscriptionModel } from 'ai';
import { isObject } from 'smob';
import type { Agent } from '../agent/types.ts';
import { inject } from '../context/module.ts';
import { InvalidAgentDefinitionError } from '../errors/index.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import { noModelMessage, toLanguageModel } from './asserts.ts';
import { MODEL_CONTEXT } from './constants.ts';
import type {
    IModelResolver,
    ModelCheckOptions,
    ModelContext,
    ModelRef,
    TranscriptionModelRef,
} from './types.ts';

const SHAPE = 'must be a "<provider>/<model>" string or a LanguageModel object.';
const NO_RESOLVER = 'but the engine has no model resolver (EngineOptions.models); pass a LanguageModel object.';

function isModelRef(value: unknown): value is ModelRef {
    return (typeof value === 'string' && value.length > 0) || isObject(value);
}

/**
 * Refuses the default model (EngineOptions.model) when it is neither a
 * non-empty string nor an object, a string without a resolver, or a string
 * the resolver refuses.
 */
export function checkDefaultModel(options: ModelCheckOptions): void {
    const { model, models } = options;

    if (model === undefined) {
        return;
    }

    if (!isModelRef(model)) {
        throw new InvalidAgentDefinitionError(`The default model ${SHAPE}`);
    }

    if (typeof model !== 'string') {
        return;
    }

    if (!models) {
        throw new InvalidAgentDefinitionError(`The default model "${model}" is a model string, ${NO_RESOLVER}`);
    }

    models.check(model);
}

/**
 * Refuses an agent the engine could not run: no model and no default, a
 * model that is neither a non-empty string nor an object, or a string the
 * resolver refuses or the engine has no resolver for
 * (InvalidAgentDefinitionError). Objects are never checked.
 */
export function checkAgentModel(agent: Agent, options: ModelCheckOptions): void {
    const ref: unknown = agent.definition.model ?? options.model;

    if (ref === undefined || ref === null) {
        throw new InvalidAgentDefinitionError(noModelMessage(agent.name));
    }

    if (!isModelRef(ref)) {
        throw new InvalidAgentDefinitionError(`Agent "${agent.name}": model ${SHAPE}`);
    }

    if (typeof ref !== 'string') {
        return;
    }

    if (!options.models) {
        throw new InvalidAgentDefinitionError(`Agent "${agent.name}" uses the model string "${ref}", ${NO_RESOLVER}`);
    }

    options.models.check(ref, agent.name);
}

/**
 * The LanguageModel for `ref`, else the model of `agent` in the live
 * registry, else the engine's default. A string goes through the resolver;
 * without one, or with no model at all, it is an
 * InvalidAgentDefinitionError. Shared by resolveModel(ctx) and
 * IEngine.resolveModel().
 */
export function resolveModelRef(
    context: ModelContext,
    ref: ModelRef | undefined,
    agent: string | undefined,
): LanguageModel {
    const wanted = ref ?? (agent === undefined ? undefined : context.agentModel(agent)) ?? context.model;

    if (typeof wanted === 'string' && !context.models) {
        throw new InvalidAgentDefinitionError(
            `resolveModel(): the model string "${wanted}" needs a model resolver (EngineOptions.models).`,
        );
    }

    if (wanted === undefined && agent === undefined) {
        throw new InvalidAgentDefinitionError(
            'resolveModel(): no model given and the engine sets no default (EngineOptions.model).',
        );
    }

    return toLanguageModel(wanted, context.models, agent ?? '');
}

/**
 * The TranscriptionModel for `ref`: an object as is, a string through
 * `models.transcription()`. A string without a resolver, a resolver without
 * transcription models, or a ref it refuses is an
 * InvalidAgentDefinitionError. Shared by IEngine.resolveTranscriptionModel().
 */
export function resolveTranscriptionModelRef(
    models: IModelResolver | undefined,
    ref: TranscriptionModelRef,
): TranscriptionModel {
    if (typeof ref !== 'string') {
        return ref;
    }

    if (!models) {
        throw new InvalidAgentDefinitionError(
            `The transcription model string "${ref}" needs a model resolver (EngineOptions.models).`,
        );
    }

    if (!models.transcription) {
        throw new InvalidAgentDefinitionError(
            `The transcription model "${ref}" cannot resolve: the model resolver hands out no transcription models.`,
        );
    }

    try {
        return models.transcription(ref);
    } catch (error) {
        const message = Error.isError(error) ? error.message : String(error);
        throw new InvalidAgentDefinitionError(`Transcription model "${ref}" could not be resolved: ${message}`);
    }
}

/**
 * The LanguageModel for `ref` or, without one, for the run's agent model
 * (its own, else the engine's default), read from the live registry. A
 * string goes through EngineOptions.models; without a resolver it is an
 * InvalidAgentDefinitionError. A context the engine did not pass throws
 * ContextNotProvidedError.
 */
export function resolveModel<S extends StateSchema = StateSchema>(
    ctx: ToolContext<S>,
    ref?: ModelRef,
): LanguageModel {
    return resolveModelRef(inject(ctx, MODEL_CONTEXT), ref, ctx.run.agent);
}
