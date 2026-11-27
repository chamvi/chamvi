/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, it } from 'vitest';
import { StateValidator } from '@chamvi/core-kit';
import { verify } from '../../../utils/validator.ts';
import type { Row } from '../../../utils/validator.ts';

describe('StateValidator (the kv write)', () => {
    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned issues readable */
    const rows: Row[] = [
        { title: 'accepts a value', input: { value: { a: 1 } }, output: { value: { a: 1 } } },
        { title: 'accepts a null value', input: { value: null }, output: { value: null } },
        { title: 'accepts a falsy value', input: { value: 0 }, output: { value: 0 } },
        { title: 'accepts an empty string', input: { value: '' }, output: { value: '' } },
        { title: 'accepts false', input: { value: false }, output: { value: false } },
        { title: 'value: missing', input: {}, issues: [{ type: 'item', path: ['value'], message: 'is required', code: 'required' }] },
    ];
    /* eslint-enable @stylistic/object-curly-newline */

    it.each(rows)('$title', async (row) => {
        await verify(new StateValidator(), row);
    });
});
