/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/* eslint-disable max-classes-per-file */
import type { IClock } from '@chamvi/core';
import { 
    ForceLoggedInMiddleware, 
    RequiredJsonBodyMiddleware, 
    assertGranted, 
    usePrincipal, 
} from '@chamvi/http';
import type { Principal } from '@chamvi/http';
import { ConflictError } from '@ebec/http';
import {
    DBody,
    DContext,
    DController,
    DDelete,
    DGet,
    DPatch,
    DPath,
    DPost,
    DPut,
    DStatus,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';

/** `GET /notes`, `GET /notes/:id`, `POST /notes/:id/approve`. */
@DController('/notes')
export class NotesController {
    @DGet('')
    async list(): Promise<unknown[]> {
        return [];
    }

    @DGet('/:id')
    async get(): Promise<Record<string, unknown>> {
        return {};
    }

    @DPost('/:id/approve')
    async approve(): Promise<Record<string, unknown>> {
        return {};
    }
}

/** `GET /notes` and `GET /memos`: one class under two base paths. */
@DController(['/notes', '/memos'])
export class AliasedController {
    @DGet('')
    async list(): Promise<unknown[]> {
        return [];
    }
}

/** `@DController` without a method decorator: no routes. */
@DController('/empty')
export class EmptyController {}

/** Method decorators without `@DController` (base path `''`). */
export class BaselessController {
    @DGet('/x')
    async get(): Promise<Record<string, unknown>> {
        return {};
    }
}

/** No decorator at all. */
export class UndecoratedController {
    async get(): Promise<Record<string, unknown>> {
        return {};
    }
}

export type TestControllerMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const METHOD_DECORATORS = {
    GET: DGet,
    POST: DPost,
    PUT: DPut,
    PATCH: DPatch,
    DELETE: DDelete,
};

/**
 * An instance of a fresh class decorated with `@DController(url)` and one
 * method decorator per `[method, path]`, each answering `{ method, path }`.
 */
export function createTestController(
    url: string | string[],
    routes: [TestControllerMethod, string][] = [],
): object {
    class TestController {}

    routes.forEach(([method, path], index) => {
        const key = `route${index}`;
        const descriptor: PropertyDescriptor = {
            value: async () => ({ method, path }),
            writable: true,
            configurable: true,
        };

        Object.defineProperty(TestController.prototype, key, descriptor);
        METHOD_DECORATORS[method](path)(TestController.prototype, key, descriptor);
    });

    DController(url)(TestController);

    return new TestController();
}

/** The permission `NoteService.guarded()` checks. */
export const NOTE_PERMISSION = 'note_read';

/** A fake service: the permission check lives here, not in the controller. */
export class NoteService {
    protected clock: IClock;

    constructor(ctx: { clock: IClock }) {
        this.clock = ctx.clock;
    }

    async guarded(principal: Principal): Promise<{ ok: true }> {
        await assertGranted(principal, this.clock, NOTE_PERMISSION);

        return { ok: true };
    }
}

/**
 * A controller as an app writes it, over the public helpers of
 * `@chamvi/http`: `GET /notes/public` (no middleware), `GET /notes/guarded`
 * (the service checks `note_read`), `GET /notes/stale` (409),
 * `GET /notes/boom` (a plain Error), `GET /notes/:id` (logged in) and
 * `POST /notes` (a required JSON body, 201). The static paths come first:
 * routup matches in declaration order and `/:id` would take them.
 */
@DController('/notes')
export class NoteController {
    protected service: NoteService;

    constructor(ctx: { service: NoteService }) {
        this.service = ctx.service;
    }

    @DGet('/public')
    async public(): Promise<{ public: true }> {
        return { public: true };
    }

    @DGet('/guarded')
    async guarded(@DContext() event: IAppEvent): Promise<{ ok: true }> {
        return this.service.guarded(await usePrincipal(event));
    }

    @DGet('/stale')
    async stale(): Promise<never> {
        throw new ConflictError({ code: 'STALE_LOCK', message: 'x' });
    }

    @DGet('/boom')
    async boom(): Promise<never> {
        throw new Error('secret');
    }

    @DGet('/:id', [ForceLoggedInMiddleware])
    async get(@DPath('id') id: string): Promise<{ id: string }> {
        return { id };
    }

    @DPost('', [RequiredJsonBodyMiddleware])
    @DStatus(201)
    async create(@DBody() body: unknown): Promise<unknown> {
        return body;
    }
}
