/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { App } from 'routup';
import { createTestApp } from '../../utils/app.ts';
import { NotesController, createTestController } from '../../utils/controllers.ts';
import { pathLabels } from '../../utils/metrics.ts';

function send(app: App, path: string, method = 'GET'): Promise<Response> {
    return app.fetch(new Request(`http://test${path}`, { method }));
}

describe('metrics labels of contributed controllers', () => {
    it('labels a route by its declared pattern, never by the raw path', async () => {
        const { app } = createTestApp({ metrics: undefined, controllers: [new NotesController()] });

        await send(app, '/notes/7');
        await send(app, '/notes/7/approve', 'POST');
        await send(app, '/notes');
        await send(app, '/notes/a/b/c');
        await send(app, '/Notes/7/');

        const labels = await pathLabels(app);

        expect(labels).toEqual(['/_unmatched', '/notes', '/notes/:id', '/notes/:id/approve']);
        expect(labels.some((label) => label.includes('7'))).toBe(false);
    });

    it('labels a route under basePath', async () => {
        const { app } = createTestApp({
            metrics: undefined,
            basePath: '/api',
            controllers: [new NotesController()],
        });

        await send(app, '/api/notes/7');
        await send(app, '/api/notes/7/approve', 'POST');

        expect(await pathLabels(app, '/api/metrics')).toEqual(['/notes/:id', '/notes/:id/approve']);
    });

    it.each([
        ['static first', [['GET', '/public'], ['GET', '/:id']] as const, '/public', '/notes/public'],
        ['parameter first', [['GET', '/:id'], ['GET', '/public']] as const, '/:id', '/notes/:id'],
    ])('labels the first declared route that matches, the one routup serves (%s)', async (_order, routes, served, label) => {
        const controller = createTestController('/notes', routes.map(([method, path]) => [method, path]));
        const { app } = createTestApp({ metrics: undefined, controllers: [controller] });
        const response = await send(app, '/notes/public');

        expect(await response.json()).toEqual({ method: 'GET', path: served });
        expect(await pathLabels(app)).toEqual([label]);
    });

    it('labels HEAD by the GET route of the path, OPTIONS /_unmatched, as the built-in routes', async () => {
        const { app } = createTestApp({ metrics: undefined, controllers: [new NotesController()] });

        await send(app, '/notes/7', 'HEAD');
        await send(app, '/notes/8', 'OPTIONS');
        await send(app, '/notes/9/approve', 'OPTIONS');
        await send(app, '/runs/9', 'HEAD');
        await send(app, '/runs/9', 'OPTIONS');

        expect(await pathLabels(app)).toEqual(['/_unmatched', '/notes/:id', '/runs/:id']);
    });
});
