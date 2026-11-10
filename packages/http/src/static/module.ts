/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { IClock } from '@chamvi/core';
import type { HttpRoute, HttpRouteResult } from '../app/types.ts';
import {
    ASSET_CACHE_CONTROL,
    BUILD_RETRY_MS,
    DOCUMENT_CACHE_CONTROL,
    STATIC_PATH_PATTERN,
    STATIC_SECURITY_HEADERS,
} from './constants.ts';
import {
    isFileLike,
    loadBuild,
    renderStaticIndex,
    resolveBuildPath,
} from './helpers.ts';
import type { BuildFile, StaticRoutesOptions } from './types.ts';

/**
 * A prebuilt single-page app as one extra route: every `GET` below `path`
 * answers a file of the build (hashed `assets/` cached for a year, the rest
 * `no-cache`), `index.html` with the config and `<base>` injected for any
 * other path without an extension (client routes), else 404. Unauthenticated
 * (a page holds no secret) and not rate limited; every answer carries the
 * CSP and the security headers.
 */
export function staticRoutes(options: StaticRoutesOptions): HttpRoute[] {
    const { path, root } = options;

    if (typeof path !== 'string' || !STATIC_PATH_PATTERN.test(path)) {
        throw new InvalidAgentDefinitionError('staticRoutes: path must be a lower-case path like /ui/ext/name, without a trailing slash.');
    }

    if (typeof root !== 'string' || root.length === 0) {
        throw new InvalidAgentDefinitionError('staticRoutes: root must be a non-empty path.');
    }

    // a missing build is read again at most every BUILD_RETRY_MS (the route
    // is unauthenticated and not rate limited): in between, requests answer
    // 500 without reading the folder or reporting again
    let build: Promise<Map<string, BuildFile>> | undefined;
    let failedAt: number | undefined;
    const load = (clock: IClock): Promise<Map<string, BuildFile>> | undefined => {
        if (failedAt !== undefined && clock.now().getTime() - failedAt < BUILD_RETRY_MS) {
            return undefined;
        }

        build ??= loadBuild(root).then((files) => {
            if (!files.has('index.html')) {
                throw new Error('index.html missing');
            }

            failedAt = undefined;

            return files;
        }).catch(() => {
            // not memoized for good: the build may land later (e.g. a volume mounted after start)
            build = undefined;
            failedAt = clock.now().getTime();

            throw new InvalidAgentDefinitionError(`staticRoutes: no build in ${root}.`);
        });

        return build;
    };

    // one config, CSP and index per app basePath (the route context's)
    const rendered = new Map<string, {
        config: unknown;
        headers: Record<string, string>;
        index?: Uint8Array
    }>();
    const view = (apiBase: string) => {
        let entry = rendered.get(apiBase);

        if (!entry) {
            const config = options.config(apiBase);

            entry = { config, headers: { ...STATIC_SECURITY_HEADERS, 'content-security-policy': options.csp(config) } };
            rendered.set(apiBase, entry);
        }

        return entry;
    };

    return [{
        method: 'GET',
        path,
        prefix: true,
        rateLimit: false,
        handler: async ({ subpath }, ctx): Promise<HttpRouteResult> => {
            const entry = view(ctx.basePath);
            const key = resolveBuildPath(subpath);
            const failure = (status: 404 | 500): HttpRouteResult => ({
                status,
                headers: entry.headers,
                body: status === 404 ?
                    {
                        status,
                        code: 'not_found',
                        message: 'Not Found',
                    } :
                    {
                        status,
                        code: 'internal_error',
                        message: 'Internal Server Error',
                    },
            });

            if (key === undefined) {
                return failure(404);
            }

            const loading = load(ctx.clock);

            if (!loading) {
                return failure(500);
            }

            const files = await loading;

            if (key === '' || key === 'index.html' || (!files.has(key) && !isFileLike(key))) {
                entry.index ??= new TextEncoder().encode(renderStaticIndex(
                    new TextDecoder().decode(files.get('index.html')!.bytes),
                    entry.config,
                    `${ctx.basePath}${path}`,
                ));

                return {
                    status: 200,
                    headers: {
                        ...entry.headers,
                        'content-type': 'text/html; charset=utf-8',
                        'cache-control': DOCUMENT_CACHE_CONTROL,
                    },
                    body: entry.index,
                };
            }

            const file = files.get(key);

            if (!file) {
                return failure(404);
            }

            return {
                status: 200,
                headers: {
                    ...entry.headers,
                    'content-type': file.type,
                    'cache-control': file.immutable ? ASSET_CACHE_CONTROL : DOCUMENT_CACHE_CONTROL,
                },
                body: file.bytes,
            };
        },
    }];
}
