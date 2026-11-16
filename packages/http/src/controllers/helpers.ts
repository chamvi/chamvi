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
import type { ControllerRoute } from './types.ts';

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
 * nor starts with `/`, or that routup's matcher refuses, throws.
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

/** The index of the `}` closing the `{` at `start`, skipping escaped characters and nested groups. */
function findGroupEnd(path: string, start: number): number {
    let depth = 0;

    for (let index = start; index < path.length; index++) {
        const char = path[index];

        if (char === '\\') {
            index++;
        } else if (char === '{') {
            depth++;
        } else if (char === '}' && --depth === 0) {
            return index;
        }
    }

    return path.length;
}

/** Every path a pattern with optional groups (`{...}`) stands for: each group taken and left out. */
function expandGroups(path: string): string[] {
    for (let index = 0; index < path.length; index++) {
        if (path[index] === '\\') {
            index++;
        } else if (path[index] === '{') {
            const end = findGroupEnd(path, index);
            const head = path.slice(0, index);
            const inner = [...expandGroups(path.slice(index + 1, end)), ''];
            const tails = expandGroups(path.slice(end + 1));

            return inner.flatMap((middle) => tails.map((tail) => `${head}${middle}${tail}`));
        }
    }

    return [path];
}

/**
 * The segments of a pattern: split on `/` outside a quoted parameter name
 * (`:"section/name"` is one token) and outside an escape; an escaped `\/`
 * matches a `/` of the request, so it splits too.
 */
const PATTERN_SEGMENT = /(?:\\[^/]|[:*]"(?:[^"\\]|\\.)*"|[^/\\])+/g;

/** `text` without its escapes, lowercased as routup matches. */
function toLiteral(text: string): string {
    return text.replace(/\\(.)/g, '$1').toLowerCase();
}

/**
 * Whether the pattern `segment` can match the request segment `expected`:
 * `true` for a wildcard reaching the rest of the path, `false` when it
 * cannot match, `undefined` when it matches this one segment. Literal text
 * before the first token and after the last one must fit; text between two
 * tokens is not compared (conservative: an overlap is assumed).
 */
function matchSegment(segment: string, expected: string): boolean | undefined {
    const tokens = Array.from(segment.matchAll(NAMED_TOKEN));
    const [first] = tokens;
    const last = tokens.at(-1);

    if (!first || !last) {
        return toLiteral(segment) === expected ? undefined : false;
    }

    const lead = toLiteral(segment.slice(0, first.index));

    if (!expected.startsWith(lead)) {
        return false;
    }

    const wildcard = tokens.some((token) => token[1] === '*');

    if (wildcard) {
        return true;
    }

    const trail = toLiteral(segment.slice(last.index + last[0].length));

    // every parameter takes at least one character
    if (!expected.endsWith(trail) || expected.length < lead.length + trail.length + 1) {
        return false;
    }

    return undefined;
}

/**
 * Whether some request path matches both the controller route `path` (a
 * routup pattern) and the static `target` (`prefix`: also every path below
 * it), compared segment by segment: a segment holding a parameter matches a
 * segment its literal text fits, one holding a wildcard the rest of the path.
 */
export function overlapsRoute(path: string, target: string, prefix: boolean): boolean {
    const targetSegments = target.toLowerCase().split('/').filter(Boolean);

    return expandGroups(path).some((variant) => {
        const segments = variant.match(PATTERN_SEGMENT) ?? [];

        for (const [index, expected] of targetSegments.entries()) {
            const segment = segments[index];

            if (segment === undefined) {
                return false;
            }

            const match = matchSegment(segment, expected);

            if (match !== undefined) {
                return match;
            }
        }

        return prefix || segments.length === targetSegments.length;
    });
}

/**
 * Finds the contributed route of a request `path` (relative to `basePath`,
 * as `routePath()` answers it) with routup's matchers, built once here:
 * the first route in mount order, as routup answers with the first
 * declared match. With `method`, only a route of that method (`HEAD` also
 * a `GET` route, routup's fallback); without, a route of any method.
 */
export function createControllerRouteMatcher(
    routes: readonly ControllerRoute[],
): (path: string, method?: string) => ControllerRoute | undefined {
    const matchers = routes.map((route) => ({ route, matcher: toRouteMatcher(route.path) }));

    return (path, method) => matchers.find(({ route, matcher }) => (
        method === undefined ||
        route.method === method ||
        (method === 'HEAD' && route.method === 'GET')
    ) && matcher.test(path))?.route;
}
