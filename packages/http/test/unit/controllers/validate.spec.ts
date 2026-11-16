/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { HttpRoute } from '@chamvi/http';
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

    it('refuses a controller route equal to an HttpRoute of the same method', () => {
        expect(message(() => createTestApp({
            routes: [route({ path: '/extra' })],
            controllers: [createTestController('/Extra', [['GET', '']])],
        }))).toBe('Controller route "GET /Extra" collides with the route "GET /extra".');
    });

    it('refuses a controller route whose pattern matches an HttpRoute of the same method', () => {
        expect(() => createTestApp({
            routes: [route({ path: '/extra/x' })],
            controllers: [createTestController('/extra', [['GET', '/:id']])],
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('accepts the path of an HttpRoute under another method', () => {
        expect(() => createTestApp({
            routes: [route({ path: '/extra' })],
            controllers: [createTestController('/extra', [['POST', '']])],
        })).not.toThrow();
    });

    it('refuses a controller route under a prefix route of the same method', () => {
        expect(message(() => createTestApp({
            routes: [route({ path: '/ui', prefix: true })],
            controllers: [createTestController('/ui', [['GET', '/notes']])],
        }))).toBe('Controller route "GET /ui/notes" lies under the prefix route "/ui".');
    });

    it('refuses a controller route at a prefix route of the same method', () => {
        expect(() => createTestApp({
            routes: [route({ path: '/ui', prefix: true })],
            controllers: [createTestController('/UI', [['GET', '']])],
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('accepts a controller route under a prefix route of another method', () => {
        expect(() => createTestApp({
            routes: [route({ path: '/ui', prefix: true })],
            controllers: [createTestController('/ui', [['POST', '/notes']])],
        })).not.toThrow();
    });

    it('accepts a controller beside a prefix route', () => {
        expect(() => createTestApp({
            routes: [route({ path: '/ui', prefix: true })],
            controllers: [createTestController('/uix', [['GET', '']])],
        })).not.toThrow();
    });

    describe('beside a prefix route', () => {
        const assets = (overrides: Partial<HttpRoute> = {}) => route({
            path: '/ui/assets',
            prefix: true,
            rateLimit: false,
            ...overrides,
        });

        it('refuses a parameter route that takes requests below the prefix', () => {
            expect(message(() => createTestApp({
                routes: [assets()],
                controllers: [createTestController('/ui', [['GET', '/:section/:file']])],
            }))).toBe('Controller route "GET /ui/:section/:file" lies under the prefix route "/ui/assets".');
        });

        it('refuses a parameter route above the prefix route matching it', () => {
            expect(message(() => createTestApp({
                routes: [assets()],
                controllers: [createTestController('/ui', [['GET', '/:section']])],
            }))).toBe('Controller route "GET /ui/:section" lies under the prefix route "/ui/assets".');
        });

        it.each([
            ['above the prefix', '/ui', '/*rest'],
            ['at the prefix', '/ui/assets', '/*rest'],
            ['after a parameter', '/ui', '/:section/*rest'],
            ['inside an optional group', '/ui', '/:section{/*rest}'],
            ['in a segment with static text', '/ui', '/a*rest'],
        ])('refuses a wildcard %s', (_name, base, path) => {
            expect(() => createTestApp({
                routes: [assets()],
                controllers: [createTestController(base, [['GET', path]])],
            })).toThrow(InvalidAgentDefinitionError);
        });

        it('splits segments only on a slash outside a quoted parameter name', () => {
            // routup matches `/ui/:"section/name"/:file` against `/ui/assets/scripts`
            expect(message(() => createTestApp({
                routes: [assets({ path: '/ui/assets/scripts' })],
                controllers: [createTestController('/ui', [['GET', '/:"section/name"/:file']])],
            }))).toBe('Controller route "GET /ui/:"section/name"/:file" lies under the prefix route "/ui/assets/scripts".');
        });

        // routup (path-to-regexp) matches `/ui/as:rest` against `/ui/assets` (rest "sets")
        // and `/ui/:"x"sets` (x "as"), never `/ui/styles-:id` or `/ui/:a-sets`
        it.each([
            ['static text before it', '/as:rest'],
            ['a single letter of static text before it', '/a:rest'],
            ['static text after it', '/:"x"sets'],
            ['a quoted name holding a colon', '/:"a:b"'],
        ])('refuses a parameter segment with %s that can match the prefix', (_name, path) => {
            expect(() => createTestApp({
                routes: [assets()],
                controllers: [createTestController('/ui', [['GET', `${path}/:file`]])],
            })).toThrow(InvalidAgentDefinitionError);
        });

        it('refuses an optional group reaching the prefix', () => {
            expect(() => createTestApp({
                routes: [assets()],
                controllers: [createTestController('/ui', [['GET', '/:section{/x}/:file']])],
            })).toThrow(InvalidAgentDefinitionError);
        });

        it.each([
            ['another method', 'POST', '/ui', '/:section/:file'],
            ['a disjoint static segment', 'GET', '/ui', '/styles/:file'],
            ['a shorter route without a wildcard', 'GET', '/ui', ''],
            ['a disjoint static base', 'GET', '/uix', '/:section/*rest'],
            ['a parameter after disjoint static text', 'GET', '/ui', '/styles-:id'],
            ['a parameter after disjoint static text, below the prefix', 'GET', '/ui', '/styles-:id/:file'],
            ['a parameter before disjoint static text', 'GET', '/ui', '/:a-sets/:file'],
            ['a wildcard after disjoint static text', 'GET', '/ui', '/styles*rest'],
        ])('accepts %s', (_name, method, base, path) => {
            expect(() => createTestApp({
                routes: [assets()],
                controllers: [createTestController(base, [[method as 'GET', path]])],
            })).not.toThrow();
        });
    });

    describe('beside a static route', () => {
        it('refuses a wildcard covering it', () => {
            expect(message(() => createTestApp({
                routes: [route({ path: '/ui/assets/app.js' })],
                controllers: [createTestController('/ui', [['GET', '/*rest']])],
            }))).toBe('Controller route "GET /ui/*rest" collides with the route "GET /ui/assets/app.js".');
        });

        it.each([
            ['another method', 'POST', '/:section/:file'],
            ['a different depth', 'GET', '/:section'],
            ['a disjoint static segment', 'GET', '/styles/:file'],
        ])('accepts %s', (_name, method, path) => {
            expect(() => createTestApp({
                routes: [route({ path: '/ui/assets/app.js' })],
                controllers: [createTestController('/ui', [[method as 'GET', path]])],
            })).not.toThrow();
        });
    });
});
