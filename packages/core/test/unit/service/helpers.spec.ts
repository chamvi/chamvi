/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { BadRequestError } from '@chamvi/errors';
import { Container, defineValidator } from 'validup';
import { validateBody } from '@chamvi/core';

describe('validateBody', () => {
    const container = () => {
        const c = new Container<{ a?: unknown }>();

        c.mount('a', { optional: true }, defineValidator({ run: ({ value }) => value }));

        return c;
    };

    it.each([[[]], [[1]], ['x'], [null], [5]])('rejects %j', async (body) => {
        const promise = validateBody(container(), body);

        await expect(promise).rejects.toBeInstanceOf(BadRequestError);
        await expect(promise).rejects.toThrow('The request body must be a JSON object.');
    });

    it('reads a missing body as {}', async () => {
        expect(await validateBody(container(), undefined)).toEqual({});
    });

    it('drops unknown keys', async () => {
        expect(await validateBody(container(), { a: 1, extra: 2 })).toEqual({ a: 1 });
    });

    it('runs the given group', async () => {
        const c = new Container<{ a?: unknown }>();

        c.mount('a', { group: 'create', optional: true }, defineValidator({ run: ({ value }) => value }));

        expect(await validateBody(c, { a: 1 }, { group: 'create' })).toEqual({ a: 1 });
        expect(await validateBody(c, { a: 1 }, { group: 'update' })).toEqual({});
    });
});
