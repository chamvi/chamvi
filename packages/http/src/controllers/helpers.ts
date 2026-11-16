/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { hasDecoratorMeta, useDecoratorMeta } from '@routup/decorators';
import type { DecoratorMeta } from '@routup/decorators';
import { PathMatcher } from 'routup';
import { isObject } from 'smob';
import { STATIC_ROUTE_PATH } from '../app/constants.ts';

/** A path-to-regexp parameter or wildcard (`:id`, `*rest`, `:"quoted name"`), not an escaped `\:` or `\*`. */
const NAMED_TOKEN = /(?<!\\)([:*])(?:"(?:[^"\\]|\\.)*"|[\p{ID_Start}$_][\p{ID_Continue}$]*)/gu;

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

/**
 * `base` joined with a method path as routup mounts it (inner `//`
 * collapsed, a trailing slash dropped); a method path that is neither empty
 * nor starts with `/`, or that routup's matcher refuses, throws. routup
 * joins any other path with a `/` (`{/:id}` becomes `/notes/{/:id}`, which
 * matches neither `/notes` nor `/notes/5`), so the leading `/` is required.
 */
export function joinControllerPath(method: string, base: string, path: string): string {
    const refuse = () => new InvalidAgentDefinitionError(`Controller method path "${path}" of "${method} ${base}" must be a path routup accepts, starting with "/".`);

    if (typeof path !== 'string' || (path !== '' && !path.startsWith('/'))) {
        throw refuse();
    }

    const joined = `${base}${path}`.replace(/\/+/g, '/').replace(/\/$/, '');

    try {
        toRouteMatcher(joined);
    } catch {
        throw refuse();
    }

    return joined;
}

/** The matcher routup builds for a method route at registration: it throws on syntax routup refuses. */
export function toRouteMatcher(path: string): PathMatcher {
    return new PathMatcher(path, { end: true });
}

/** `path` lowercased, parameter names replaced by `:` and wildcard names by `*` (routup matches case-insensitively). */
export function toRouteKey(path: string): string {
    return path.replace(NAMED_TOKEN, '$1').toLowerCase().replace(/\/+$/, '');
}
