/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { hasDecoratorMeta, useDecoratorMeta } from '@routup/decorators';
import type { DecoratorMeta } from '@routup/decorators';
import { isObject } from 'smob';
import { STATIC_ROUTE_PATH } from '../app/constants.ts';

/**
 * The decorator metadata of a controller instance; anything else (no
 * object, a class, an object without metadata) throws. `hasDecoratorMeta`
 * first: `useDecoratorMeta` writes an empty entry onto an object without one.
 */
export function readControllerMeta(controller: unknown): DecoratorMeta {
    if (!isObject(controller) || !hasDecoratorMeta(controller)) {
        throw new InvalidAgentDefinitionError('A contributed controller must be an instance of a class decorated with @DController.');
    }

    return useDecoratorMeta(controller);
}

/** The `@DController` base paths, each a static path starting with `/`. */
export function readBasePaths(meta: DecoratorMeta): string[] {
    const urls = Array.isArray(meta.url) ? meta.url : [meta.url];

    for (const url of urls) {
        if (typeof url !== 'string' || !STATIC_ROUTE_PATH.test(url)) {
            throw new InvalidAgentDefinitionError(`Controller path "${String(url)}" must be a static path starting with "/".`);
        }
    }

    return urls;
}
