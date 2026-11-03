/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { keyedArtifactId } from '@chamvi/core';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    SHOTS_PNG,
    call,
    createRunAgents,
    createRunTestApp,
    shotsAgent,
} from '../../utils/app.ts';

async function pausedShots() {
    const ctx = createRunTestApp({
        agents: [
            ...createRunAgents(),
            shotsAgent(),
        ],
    });
    const response = await call(ctx.app, 'POST', '/agents/shots/runs', { token: ADMIN_TOKEN });
    const { runId } = await response.json() as { runId: string };

    await ctx.engine.start();
    await ctx.engine.idle();

    expect((await ctx.store.runs.findOne(runId))?.status).toBe('waiting');

    return { ...ctx, runId };
}

describe('approval artifacts on the run wire', () => {
    it('GET /runs/:id of a waiting run includes waiting.artifacts and options[].artifacts', async () => {
        const {
            app, 
            engine, 
            runId, 
        } = await pausedShots();
        const response = await call(app, 'GET', `/runs/${runId}`, { token: READER_TOKEN });

        expect(response.status).toBe(200);

        const { waiting } = await response.json() as {
            waiting: {
                artifacts?: string[];
                options?: Array<{ id: string; artifacts?: string[] }>
            }
        };

        expect(waiting.artifacts).toEqual([keyedArtifactId(runId, 'overview')]);
        expect(waiting.options).toEqual([{
            id: 'button',
            label: 'Button',
            artifacts: [keyedArtifactId(runId, 'button/diff')],
        }, { id: 'none', label: 'None' }]);
        await engine.drain();
    });

    it('GET /runs/:id/artifacts/:artifactId returns a keyed artifact\'s bytes with its media type', async () => {
        const {
            app, 
            engine, 
            runId, 
        } = await pausedShots();
        const id = keyedArtifactId(runId, 'button/diff');
        const response = await call(app, 'GET', `/runs/${runId}/artifacts/${id}`, { token: READER_TOKEN });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(response.headers.get('content-disposition')).toBe('attachment; filename="button-diff.png"; filename*=UTF-8\'\'button-diff.png');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(SHOTS_PNG);

        const list = await call(app, 'GET', `/runs/${runId}/artifacts`, { token: READER_TOKEN });
        const { data } = await list.json() as { data: Array<{ id: string; filename?: string }> };

        expect(data.map((item) => item.id).sort()).toEqual([
            keyedArtifactId(runId, 'overview'),
            keyedArtifactId(runId, 'button/diff'),
        ].sort());
        await engine.drain();
    });
});
