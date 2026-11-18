/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/* eslint-disable max-classes-per-file */
import type { IClock } from '@chamvi/core';
import { DController, DGet } from '@routup/decorators';

/** `GET /notes/now`: the time of the clock the factory resolved from the container. */
@DController('/notes')
export class NoteController {
    protected clock: IClock;

    constructor(ctx: { clock: IClock }) {
        this.clock = ctx.clock;
    }

    @DGet('/now')
    async now(): Promise<{ now: string }> {
        return { now: new Date(this.clock.now()).toISOString() };
    }
}

/** `GET /memos`: an empty list. */
@DController('/memos')
export class MemoController {
    @DGet('')
    async list(): Promise<unknown[]> {
        return [];
    }
}

/** A controller under the base path of chamvi's own `/runs`: refused. */
@DController('/runs')
export class RunsController {
    @DGet('/mine')
    async list(): Promise<unknown[]> {
        return [];
    }
}

/** A minimal OpenAPI document of one operation at `path`. */
export function openApiDocument(path: string, operationId: string): object {
    return {
        openapi: '3.1.0',
        info: { title: 'app', version: '1.0.0' },
        paths: {
            [path]: {
                get: {
                    operationId,
                    responses: { 200: { description: 'ok' } },
                },
            },
        },
    };
}
