/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { HttpRoute } from '@chamvi/http';
import { decorators } from '@routup/decorators';
import { App } from 'routup';
import { readControllerRoutes } from '../../../src/controllers/module.ts';
import { createTestApp } from '../../utils/app.ts';
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
    it('reads one route per method under the base path', () => {
        expect(readControllerRoutes(new NotesController())).toEqual([
            {
                method: 'GET',
                path: '/notes',
                key: '/notes',
            },
            {
                method: 'GET',
                path: '/notes/:id',
                key: '/notes/:',
            },
            {
                method: 'POST',
                path: '/notes/:id/approve',
                key: '/notes/:/approve',
            },
        ]);
    });

    it('accepts a valid controller', () => {
        expect(() => createTestApp({ controllers: [new NotesController()] })).not.toThrow();
    });

    it('reads every base path of an array', () => {
        expect(readControllerRoutes(new AliasedController())).toEqual([
            {
                method: 'GET',
                path: '/notes',
                key: '/notes',
            },
            {
                method: 'GET',
                path: '/memos',
                key: '/memos',
            },
        ]);
        expect(() => createTestApp({ controllers: [new AliasedController()] })).not.toThrow();
    });

    it('accepts a controller without methods', () => {
        expect(readControllerRoutes(new EmptyController())).toEqual([]);
        expect(() => createTestApp({ controllers: [new EmptyController()] })).not.toThrow();
    });

    it('keys a route lowercased, parameter and wildcard names replaced, trailing slash dropped', () => {
        expect(readControllerRoutes(createTestController('/Notes', [['PUT', '/:noteId/'], ['DELETE', '/*rest']]))).toEqual([
            {
                method: 'PUT',
                path: '/Notes/:noteId',
                key: '/notes/:',
            },
            {
                method: 'DELETE',
                path: '/Notes/*rest',
                key: '/notes/*',
            },
        ]);
    });

    it('reads the paths and methods routup mounts, in its order', () => {
        // without method middlewares: routup lists those as routes of the method's path too
        const controllers = [
            createTestController('/Notes', [['GET', ''], ['PUT', '/:noteId/'], ['DELETE', '/*rest'], ['POST', '//y/']]),
            new AliasedController(),
        ];
        const app = new App();

        app.use(decorators({ controllers }));

        expect(controllers.flatMap((controller) => readControllerRoutes(controller))
            .map(({ method, path }) => ({ method, path })))
            .toEqual(app.routes.map(({ method, path }) => ({ method, path })));
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
        ['/RUNS/x'],
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

    it('refuses a custom metrics path, in any case', () => {
        expect(() => createTestApp({
            metrics: { metricsPath: '/ops/metrics' },
            controllers: [createTestController('/Ops/Metrics')],
        })).toThrow(InvalidAgentDefinitionError);
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
        ['without a leading slash', 'x'],
        ['with a parameter without a name', '/:'],
        ['with an unnamed wildcard', '/*'],
        ['with an unclosed brace', '/x{'],
        ['with a question mark', '/:id?'],
        ['with a parenthesis', '/(x)'],
        ['with an optional group without a leading slash', '{/:id}'],
    ])('refuses a method path %s', (_name, path) => {
        expect(message(() => createTestApp({ controllers: [createTestController('/notes', [['GET', path]])] })))
            .toBe(`Controller method path "${path}" of "GET /notes" must be a path routup accepts, starting with "/".`);
    });

    it.each([
        ['a named wildcard', '/*rest'],
        ['an optional group', '/x{/y}'],
        ['a trailing slash', '/:id/'],
    ])('accepts a method path with %s', (_name, path) => {
        expect(() => createTestApp({ controllers: [createTestController('/notes', [['GET', path]])] })).not.toThrow();
    });

    it('refuses the same method and key across two controllers', () => {
        expect(message(() => createTestApp({
            controllers: [
                createTestController('/Notes', [['GET', '/:id']]),
                createTestController('/notes', [['GET', '/:noteId/']]),
            ],
        }))).toBe('Controller route "GET /notes/:noteId" is registered twice.');
    });

    it('refuses the same method and key within one controller', () => {
        expect(message(() => createTestApp({ controllers: [createTestController('/notes', [['GET', '/:id'], ['GET', '/:noteId']])] }))).toBe('Controller route "GET /notes/:noteId" is registered twice.');
    });

    it('refuses two wildcards differing only in their names', () => {
        expect(message(() => createTestApp({ controllers: [createTestController('/f', [['GET', '/*a'], ['GET', '/*b']])] })))
            .toBe('Controller route "GET /f/*b" is registered twice.');
    });

    it('refuses an array base path naming one path twice', () => {
        expect(() => createTestApp({ controllers: [createTestController(['/notes', '/Notes'], [['GET', '']])] })).toThrow(InvalidAgentDefinitionError);
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
            ['equal to the base path, in another case', 'GET', '/Notes'],
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
            ['above the base path, under another method', '/UI'],
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
                controllers: [createTestController('/UI', [['GET', '']])],
            }))).toBe('Route "GET /ui" lies under the controller path "/UI".');
        });

        it.each([
            ['a sibling path', '/notes-archive', false],
            ['a sibling prefix route', '/notes-archive', true],
            ['a route above the base path', '/ui', false],
            ['a route ending in the base path', '/b/notes', false],
            ['a prefix route ending in the base path', '/b/notes', true],
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
