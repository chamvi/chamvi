/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { IAppEvent } from 'routup';
import {
    DEFAULT_BODY_LIMIT,
    DEFAULT_MAX_OPEN_STREAMS,
    DEFAULT_READY_TIMEOUT_MS,
    DEFAULT_STREAM_POLL_MS,
    HTTP_CONTEXT,
    RESERVED_ROUTE_SEGMENTS,
    STATIC_ROUTE_PATH,
} from '../constants.ts';
import { validateChannels } from '../../channels/helpers.ts';
import { validateControllers } from '../../controllers/module.ts';
import { mergeOpenApiDocuments } from '../../openapi/merge.ts';
import { validateChannelRateLimits } from '../../plugins/channels.ts';
import { readMetricsPath } from '../../plugins/helpers.ts';
import { isAtOrUnder } from '../../routes/helpers.ts';
import type { AgentIssue } from '../../agents/types.ts';
import type { HttpAppOptions, HttpContext, HttpRoute } from '../types.ts';
import { createLiveAgents, selectAgents } from './agents.ts';

/**
 * `basePath` without trailing slashes (`'/'` is no prefix at all), so every
 * reader (route matching, subpaths, limiter skips, metric labels, hook
 * URLs) sees one canonical prefix; anything but a static path is refused.
 */
export function normalizeBasePath(basePath: string | undefined): string {
    const path = (basePath ?? '').replace(/\/+$/, '');

    if (path !== '' && !STATIC_ROUTE_PATH.test(path)) {
        throw new InvalidAgentDefinitionError(`basePath "${basePath}" must be a static path starting with "/".`);
    }

    return path;
}

/**
 * Extra routes: static paths, unique per method, never under a built-in
 * route's first segment or on the metrics path.
 */
function validateRoutes(options: HttpAppOptions): HttpRoute[] {
    const routes = [...(options.routes ?? [])];
    const metricsPath = readMetricsPath(options);
    const seen = new Set<string>();

    for (const route of routes) {
        if (!STATIC_ROUTE_PATH.test(route.path)) {
            throw new InvalidAgentDefinitionError(`Route path "${route.path}" must be a static path starting with "/".`);
        }

        // routup matches static segments case-sensitively: paths differing only by case are distinct routes
        const { path } = route;
        const segment = path.split('/')[1] ?? '';

        if (RESERVED_ROUTE_SEGMENTS.includes(segment) || path === metricsPath) {
            throw new InvalidAgentDefinitionError(`Route path "${route.path}" collides with a built-in route.`);
        }

        const key = `${route.method} ${path}`;

        if (seen.has(key)) {
            throw new InvalidAgentDefinitionError(`Route "${route.method} ${route.path}" is registered twice.`);
        }

        seen.add(key);

        if (route.prefix && metricsPath !== undefined && isAtOrUnder(metricsPath, path)) {
            throw new InvalidAgentDefinitionError(`Prefix route "${route.path}" covers the metrics path.`);
        }
    }

    for (const prefixRoute of routes) {
        if (!prefixRoute.prefix) {
            continue;
        }

        const prefix = prefixRoute.path;
        // a nested prefix route is fine: registerRoutes serves the most specific first
        const covered = routes.find((other) => other !== prefixRoute &&
            other.method === prefixRoute.method &&
            (!other.prefix || other.path === prefix) &&
            isAtOrUnder(other.path, prefix));

        if (covered) {
            throw new InvalidAgentDefinitionError(`Route "${covered.method} ${covered.path}" lies under the prefix route "${prefixRoute.path}".`);
        }
    }

    return routes;
}

/**
 * The contributed OpenAPI documents checked against each other, so a
 * collision fails construction even when chamvi's own document is missing;
 * `registerOpenApiRoutes()` merges them into it.
 */
function validateOpenApiDocuments(options: HttpAppOptions): void {
    if (options.openapi === false || options.openapi?.documents === undefined) {
        return;
    }

    if (!Array.isArray(options.openapi.documents)) {
        throw new InvalidAgentDefinitionError('openapi.documents must be an array of OpenAPI documents.');
    }

    mergeOpenApiDocuments(undefined, options.openapi.documents);
}

/** `options.agentIssues` as a fresh array, only of the named agents when `names` is given. */
function readAgentIssues(options: HttpAppOptions): () => AgentIssue[] {
    const read = options.agentIssues;

    if (!read) {
        return () => [];
    }

    const served = options.agents === undefined ? undefined : new Set(options.agents);

    return () => read().filter((issue) => !served || served.has(issue.agent));
}

export function buildContext(options: HttpAppOptions): HttpContext {
    const authenticators = Array.isArray(options.auth) ? [...options.auth] : [options.auth];

    if (authenticators.length === 0) {
        throw new InvalidAgentDefinitionError('The http app needs at least one authenticator.');
    }

    // a name the engine lacks fails here; requests read the engine live
    selectAgents(options.engine, options.agents);

    const maxOpenStreams = options.stream?.maxOpen ?? DEFAULT_MAX_OPEN_STREAMS;

    if (!Number.isSafeInteger(maxOpenStreams) || maxOpenStreams < 1) {
        throw new InvalidAgentDefinitionError(`stream.maxOpen must be a positive integer, got ${maxOpenStreams}.`);
    }

    const channels = validateChannels(options.engine, options.channels);

    validateChannelRateLimits(options, channels);

    if (options.connections !== undefined && typeof options.connections !== 'function') {
        throw new InvalidAgentDefinitionError('connections must be a function returning the connection handles.');
    }

    if (options.connectionConfigs !== undefined && !options.engine.connectionService) {
        throw new InvalidAgentDefinitionError('connectionConfigs needs an engine with a connection service (its stored rows).');
    }

    if (options.connectionTypes !== undefined && typeof options.connectionTypes !== 'function') {
        throw new InvalidAgentDefinitionError('connectionTypes must be a function returning the connection type providers.');
    }

    if (options.uiPages !== undefined && typeof options.uiPages !== 'function') {
        throw new InvalidAgentDefinitionError('uiPages must be a function returning the pages.');
    }

    if (options.components !== undefined && typeof options.components !== 'function') {
        throw new InvalidAgentDefinitionError('components must be a function returning the components.');
    }

    const routes = validateRoutes(options);

    validateControllers(options, routes);
    validateOpenApiDocuments(options);

    return {
        engine: options.engine,
        runService: options.engine.runService,
        stepService: options.engine.stepService,
        artifactService: options.engine.artifactService,
        stateService: options.engine.stateService,
        agents: createLiveAgents(options.engine, options.agents),
        agentIssues: readAgentIssues(options),
        authenticators,
        basePath: normalizeBasePath(options.basePath),
        bodyLimit: options.bodyLimit ?? DEFAULT_BODY_LIMIT,
        streamPollMs: options.stream?.pollMs ?? DEFAULT_STREAM_POLL_MS,
        maxOpenStreams,
        openStreams: 0,
        readyTimeoutMs: options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
        clock: options.engine.clock,
        shutdown: options.shutdown,
        closers: new Set(),
        closed: false,
        routes,
        controllers: [...(options.controllers ?? [])],
        channels,
        connections: options.connections ?? (() => []),
        connectionTypes: options.connectionTypes ?? (() => []),
        ...(options.connectionConfigs && { connectionConfigs: options.connectionConfigs }),
        ...(options.engine.connectionService && { connectionService: options.engine.connectionService }),
        uiPages: options.uiPages ?? (() => []),
        components: options.components ?? (() => []),
        // eslint-disable-next-line no-console
        onError: options.onError ?? ((error) => console.error('[chamvi]', error)),
    };
}

/**
 * The HttpContext `createHttpApp` put on the event; a request outside such
 * an app is a server misconfiguration (InvalidAgentDefinitionError).
 */
export function useHttpContext(event: IAppEvent): HttpContext {
    const ctx = event.store[HTTP_CONTEXT] as HttpContext | undefined;

    if (!ctx) {
        throw new InvalidAgentDefinitionError('The request carries no http context: mount the routes with createHttpApp.');
    }

    return ctx;
}
