/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { HttpRoute } from '@chamvi/http';
import { useDecoratorMeta } from '@routup/decorators';
import { call, createTestApp } from '../../utils/app.ts';
import {
    AliasedController,
    BaselessController,
    EmptyController,
    NotesController,
    UndecoratedController,
    createTestController,
} from '../../utils/controllers.ts';

function route(overrides: Partial<HttpRoute> = {}): HttpRoute {
    return {
        method: 'GET',
        path: '/extra',
        handler: async () => ({ status: 200 }),
        ...overrides,
    };
}

function message(fn: () => unknown): string {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);

        return (error as Error).message;
    }

    throw new Error('expected InvalidAgentDefinitionError');
}

describe('contributed controllers', () => {
    it('accepts a valid controller', () => {
        expect(() => createTestApp({ controllers: [new NotesController()] })).not.toThrow();
    });

    it('accepts a controller under two base paths', () => {
        expect(() => createTestApp({ controllers: [new AliasedController()] })).not.toThrow();
    });

    it('accepts a controller without methods', () => {
        expect(() => createTestApp({ controllers: [new EmptyController()] })).not.toThrow();
    });

    it('refuses controllers that are not an array', () => {
        expect(() => createTestApp({ controllers: new NotesController() as never })).toThrow(InvalidAgentDefinitionError);
    });

    it.each([
        ['a class', NotesController],
        ['a plain object', {}],
        ['null', null],
        ['a string', '/notes'],
        ['an array', []],
        ['an instance of an undecorated class', new UndecoratedController()],
    ])('refuses %s', (_name, controller) => {
        expect(message(() => createTestApp({ controllers: [controller as object] })))
            .toBe('A contributed controller must be an instance of a class decorated with @DController.');
    });

    it('writes no metadata onto a refused undecorated instance', () => {
        const controller = new UndecoratedController();

        expect(() => createTestApp({ controllers: [controller] })).toThrow(InvalidAgentDefinitionError);
        expect(Object.getOwnPropertySymbols(controller)).toEqual([]);
        expect(Object.getOwnPropertySymbols(UndecoratedController.prototype)).toEqual([]);
    });

    it('refuses a plain object without writing metadata onto it', () => {
        const controller = {};

        expect(() => createTestApp({ controllers: [controller] })).toThrow(InvalidAgentDefinitionError);
        expect(Object.getOwnPropertySymbols(controller)).toEqual([]);
    });

    it('refuses method decorators without @DController', () => {
        expect(() => createTestApp({ controllers: [new BaselessController()] })).toThrow(InvalidAgentDefinitionError);
    });

    it.each([
        ['/'],
        [''],
        ['notes'],
        ['/notes/'],
        ['/notes/:id'],
        ['/notes/*rest'],
    ])('refuses the base path %j', (url) => {
        expect(message(() => createTestApp({ controllers: [createTestController(url, [['GET', '']])] })))
            .toBe(`Controller path "${url}" must be a static path starting with "/".`);
    });

    it('refuses an array base path holding an invalid entry', () => {
        expect(() => createTestApp({ controllers: [createTestController(['/notes', '/'], [['GET', '']])] }))
            .toThrow(InvalidAgentDefinitionError);
    });

    it.each([
        ['/runs'],
        ['/runs/x'],
        ['/me'],
        ['/agents/x'],
        ['/docs'],
        ['/openapi.json'],
    ])('refuses the built-in base path %j', (url) => {
        expect(message(() => createTestApp({ controllers: [createTestController(url, [['GET', '']])] })))
            .toBe(`Controller path "${url}" collides with a built-in route.`);
    });

    it('refuses the default metrics path', () => {
        expect(message(() => createTestApp({
            metrics: undefined,
            controllers: [createTestController('/metrics', [['GET', '']])],
        }))).toBe('Controller path "/metrics" collides with a built-in route.');
    });

    it('refuses a custom metrics path', () => {
        expect(() => createTestApp({
            metrics: { metricsPath: '/Ops/Metrics' },
            controllers: [createTestController('/Ops/Metrics')],
        })).toThrow(InvalidAgentDefinitionError);
    });

    it.each(['/RUNS/x', '/Docs', '/ops/metrics'])('accepts %s, a path routup matches apart from the built-in ones by case', (url) => {
        expect(() => createTestApp({
            metrics: { metricsPath: '/Ops/Metrics' },
            controllers: [createTestController(url, [['GET', '']])],
        })).not.toThrow();
    });

    it('refuses a base path covering the metrics path', () => {
        expect(message(() => createTestApp({
            metrics: { metricsPath: '/ops/metrics' },
            controllers: [createTestController('/ops', [['GET', '/:name']])],
        }))).toBe('Controller path "/ops" covers the metrics path.');
    });

    it('accepts /metrics when metrics are off', () => {
        expect(() => createTestApp({
            metrics: false,
            controllers: [createTestController('/metrics', [['GET', '']])],
        })).not.toThrow();
    });

    it('accepts /metrics when a custom metrics path is set', () => {
        expect(() => createTestApp({
            metrics: { metricsPath: '/ops/metrics' },
            controllers: [createTestController('/metrics', [['GET', '']])],
        })).not.toThrow();
    });

    it.each([
        ['with a parameter without a name', '/:', '/:'],
        ['with an unnamed wildcard', '/*', '/*'],
        ['with an unclosed brace', '/x{', '/x{'],
        ['with a question mark', '/:id?', '/:id?'],
        ['with a parenthesis', '/(x)', '/(x)'],
    ])('refuses a method path %s, naming the cause', (_name, path, cause) => {
        const text = message(() => createTestApp({ controllers: [createTestController('/notes', [['GET', path]])] }));
        const prefix = 'Controller path "/notes" cannot be mounted: ';

        expect(text.startsWith(prefix)).toBe(true);
        expect(text.slice(prefix.length)).toContain(cause);
    });

    it('names every base path of a refused controller', () => {
        expect(message(() => createTestApp({ controllers: [createTestController(['/notes', '/memos'], [['GET', '/:']])] })))
            .toMatch(/^Controller paths "\/notes", "\/memos" cannot be mounted: ./);
    });

    it.each([
        ['a named wildcard', '/*rest'],
        ['an optional group', '/x{/y}'],
        ['a trailing slash', '/:id/'],
        ['no leading slash', ':id'],
        ['a leading optional group', '{/:id}'],
        ['a slash and a leading optional group', '/{/:id}'],
    ])('accepts a method path with %s', (_name, path) => {
        expect(() => createTestApp({ controllers: [createTestController('/notes', [['GET', path]])] })).not.toThrow();
    });

    it('serves a method path without a leading slash under the base path', async () => {
        const { app } = createTestApp({ controllers: [createTestController('/notes', [['GET', ':id']])] });
        const response = await call(app, 'GET', '/notes/7');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ method: 'GET', path: ':id' });
    });

    it('accepts the same method and path in two controllers', () => {
        expect(() => createTestApp({
            controllers: [
                createTestController('/notes', [['GET', '/:id']]),
                createTestController('/notes', [['GET', '/:id']]),
            ],
        })).not.toThrow();
    });

    it('accepts the same route twice within one controller', () => {
        expect(() => createTestApp({ controllers: [createTestController('/notes', [['GET', '/:id'], ['GET', '/:noteId']])] })).not.toThrow();
    });

    it('accepts one base path in two controllers', () => {
        expect(() => createTestApp({ controllers: [createTestController('/notes', [['GET', '']]), createTestController('/Notes', [['POST', '']])] })).not.toThrow();
    });

    it('refuses a base path listed twice by one controller', () => {
        expect(message(() => createTestApp({ controllers: [createTestController(['/notes', '/notes'], [['GET', '']])] })))
            .toBe('Controller path "/notes" is listed twice.');
    });

    it('accepts base paths of one controller differing only by case: routup matches them apart', () => {
        expect(() => createTestApp({ controllers: [createTestController(['/notes', '/Notes'], [['GET', '']])] })).not.toThrow();
    });

    it('refuses a registration failure of any kind with the cause\'s message', () => {
        const controller = createTestController('/notes', [['GET', '/x']]);

        Object.defineProperty(useDecoratorMeta(controller).methods.route0, 'url', {
            get() {
                throw new TypeError('broken metadata');
            },
        });

        expect(message(() => createTestApp({ controllers: [controller] })))
            .toBe('Controller path "/notes" cannot be mounted: broken metadata');
    });

    it('answers a route repeated under other parameter names from the first controller', async () => {
        const { app } = createTestApp({
            controllers: [
                createTestController('/notes', [['GET', '/:id']]),
                createTestController('/notes', [['GET', '/:noteId/']]),
            ],
        });
        const response = await call(app, 'GET', '/notes/7');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ method: 'GET', path: '/:id' });
    });

    it('answers a base path in another case from its own controller only', async () => {
        const { app } = createTestApp({
            controllers: [
                createTestController('/Notes', [['GET', '/:id']]),
                createTestController('/notes', [['GET', '/:noteId/']]),
            ],
        });

        expect(await (await call(app, 'GET', '/notes/7')).json()).toEqual({ method: 'GET', path: '/:noteId/' });
        expect(await (await call(app, 'GET', '/Notes/7')).json()).toEqual({ method: 'GET', path: '/:id' });
        expect((await call(app, 'GET', '/NOTES/7')).status).toBe(404);
    });

    it('accepts one path under two methods', () => {
        expect(() => createTestApp({
            controllers: [
                createTestController('/notes', [['GET', '/:id']]),
                createTestController('/notes', [['DELETE', '/:id']]),
            ],
        })).not.toThrow();
    });

    describe('beside an HttpRoute', () => {
        it.each([
            ['equal to the base path', 'GET', '/notes'],
            ['below the base path', 'GET', '/notes/x'],
            ['below the base path, under another method', 'POST', '/notes/hook'],
        ])('refuses a route %s', (_name, method, path) => {
            expect(message(() => createTestApp({
                routes: [route({ method: method as 'GET', path })],
                controllers: [new NotesController()],
            }))).toBe(`Route "${method} ${path}" lies under the controller path "/notes".`);
        });

        it('refuses a prefix route below the base path', () => {
            expect(message(() => createTestApp({
                routes: [route({ path: '/ui/assets', prefix: true })],
                controllers: [createTestController('/ui', [['GET', '/styles/:file']])],
            }))).toBe('Route "GET /ui/assets" lies under the controller path "/ui".');
        });

        it('refuses a route below a controller without methods', () => {
            expect(() => createTestApp({
                routes: [route({ path: '/empty/x' })],
                controllers: [new EmptyController()],
            })).toThrow(InvalidAgentDefinitionError);
        });

        it('refuses a route below the second base path of an array', () => {
            expect(message(() => createTestApp({
                routes: [route({ path: '/memos/x' })],
                controllers: [new AliasedController()],
            }))).toBe('Route "GET /memos/x" lies under the controller path "/memos".');
        });

        it.each([
            ['above the base path', '/ui'],
        ])('refuses a prefix route %s', (_name, path) => {
            expect(message(() => createTestApp({
                routes: [route({
                    method: 'POST', 
                    path, 
                    prefix: true, 
                })],
                controllers: [createTestController('/ui/notes', [['GET', '']])],
            }))).toBe(`Controller path "/ui/notes" lies under the prefix route "${path}".`);
        });

        it('refuses a prefix route equal to the base path', () => {
            expect(message(() => createTestApp({
                routes: [route({ path: '/ui', prefix: true })],
                controllers: [createTestController('/ui', [['GET', '']])],
            }))).toBe('Route "GET /ui" lies under the controller path "/ui".');
        });

        it.each([
            ['a sibling path', '/notes-archive', false],
            ['a sibling prefix route', '/notes-archive', true],
            ['a route above the base path', '/ui', false],
            ['a route ending in the base path', '/b/notes', false],
            ['a prefix route ending in the base path', '/b/notes', true],
            ['a route equal to the base path in another case', '/Notes', false],
            ['a prefix route above the base path in another case', '/UI', true],
        ])('accepts %s', (_name, path, prefix) => {
            expect(() => createTestApp({
                routes: [route({ path, ...(prefix && { prefix: true }) })],
                controllers: [new NotesController(), createTestController('/ui/notes', [['GET', '/*rest']])],
            })).not.toThrow();
        });

        it('accepts a controller on /a beside a route on /b/a', () => {
            expect(() => createTestApp({
                routes: [route({ path: '/b/a' })],
                controllers: [createTestController('/a', [['GET', '/*rest']])],
            })).not.toThrow();
        });
    });
});
