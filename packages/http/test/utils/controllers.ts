/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/* eslint-disable max-classes-per-file */
import {
    DController,
    DDelete,
    DGet,
    DPatch,
    DPost,
    DPut,
} from '@routup/decorators';

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
