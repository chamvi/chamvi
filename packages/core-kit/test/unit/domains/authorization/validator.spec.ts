/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, it } from 'vitest';
import { AuthorizationValidator } from '@chamvi/core-kit';
import { NUL, chars, verify } from '../../../utils/validator.ts';
import type { Row } from '../../../utils/validator.ts';

describe('AuthorizationValidator (the permission check)', () => {
    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned issues readable */
    const rows: Row[] = [
        { title: 'accepts no names', input: {}, output: {} },
        { title: 'accepts an empty list', input: { names: [] }, output: { names: [] } },
        { title: 'accepts a name', input: { names: ['chamvi_run_read'] }, output: { names: ['chamvi_run_read'] } },
        { title: 'accepts 64 names of 255 characters', input: { names: Array.from({ length: 64 }, (_, i) => `${String(i).padStart(2, '0')}${chars(253)}`) }, output: { names: Array.from({ length: 64 }, (_, i) => `${String(i).padStart(2, '0')}${chars(253)}`) } },
        { title: 'names: a string', input: { names: 'chamvi_run_read' }, issues: [{ type: 'item', path: ['names'], message: 'must be an array of at most 64 strings', code: 'value_invalid', received: 'chamvi_run_read', meta: { optional: true } }] },
        { title: 'names: null', input: { names: null }, issues: [{ type: 'item', path: ['names'], message: 'must be an array of at most 64 strings', code: 'value_invalid', received: null, meta: { optional: true } }] },
        { title: 'names: 65 names', input: { names: Array.from({ length: 65 }, (_, i) => `n${i}`) }, issues: [{ type: 'item', path: ['names'], message: 'must be an array of at most 64 strings', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'names: a name that is a number', input: { names: ['a', 1] }, issues: [{ type: 'item', path: ['names', 1], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1, meta: { optional: true } }] },
        { title: 'names: an empty name', input: { names: [''] }, issues: [{ type: 'item', path: ['names', 0], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }] },
        { title: 'names: a name of 256 characters', input: { names: [chars(256)] }, issues: [{ type: 'item', path: ['names', 0], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'names: a name with a NUL', input: { names: [NUL] }, issues: [{ type: 'item', path: ['names', 0], message: 'must not contain a NUL character', code: 'value_invalid', received: NUL, meta: { optional: true } }] },
        { title: 'names: issues of two names carry their index', input: { names: ['', 'a', 7] }, issues: [{ type: 'group', message: 'Property names is invalid', data: { name: 'names' }, path: ['names'], issues: [{ type: 'item', path: ['names', 0], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }, { type: 'item', path: ['names', 2], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 7, meta: { optional: true } }], meta: { optional: true } }] },
    ];
    /* eslint-enable @stylistic/object-curly-newline */

    it.each(rows)('$title', async (row) => {
        await verify(new AuthorizationValidator(), row);
    });
});
