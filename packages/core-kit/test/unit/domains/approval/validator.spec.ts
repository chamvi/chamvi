/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, it } from 'vitest';
import { ApprovalValidator } from '@chamvi/core-kit';
import { NUL, chars, verify } from '../../../utils/validator.ts';
import type { Row } from '../../../utils/validator.ts';

describe('ApprovalValidator (the approval answer)', () => {
    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned issues readable */
    const rows: Row[] = [
        { title: 'accepts a denial without a reason', input: { approvalId: '0:x:0', approved: false }, output: { approvalId: '0:x:0', approved: false } },
        { title: 'accepts an empty reason', input: { approvalId: '0:x:0', approved: true, reason: '' }, output: { approvalId: '0:x:0', approved: true, reason: '' } },
        { title: 'accepts a reason of 1000 characters', input: { approvalId: '0:x:0', approved: true, reason: chars(1000) }, output: { approvalId: '0:x:0', approved: true, reason: chars(1000) } },
        { title: 'accepts an approval id of 255 characters', input: { approvalId: chars(255), approved: true }, output: { approvalId: chars(255), approved: true } },
        { title: 'accepts 20 selected ids of 128 characters', input: { approvalId: '0:x:0', approved: true, selected: Array.from({ length: 20 }, (_, i) => `${String(i).padStart(2, '0')}${chars(126)}`) }, output: { approvalId: '0:x:0', approved: true, selected: Array.from({ length: 20 }, (_, i) => `${String(i).padStart(2, '0')}${chars(126)}`) } },
        { title: 'refuses an empty body', input: {}, issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' }, { type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid' }] },
        { title: 'echoes a received value whose JSON has 256 characters', input: { approvalId: '0:x:0', approved: chars(254) }, issues: [{ type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid', received: chars(254) }] },
        { title: 'drops a received value whose JSON has 257 characters', input: { approvalId: '0:x:0', approved: chars(255) }, issues: [{ type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid' }] },
        { title: 'approvalId: missing', input: { approved: true }, issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' }] },
        { title: 'approvalId: a number', input: { approvalId: 1, approved: true }, issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1 }] },
        { title: 'approvalId: empty', input: { approvalId: '', approved: true }, issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '' }] },
        { title: 'approvalId: 256 characters', input: { approvalId: chars(256), approved: true }, issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid' }] },
        { title: 'approvalId: a NUL', input: { approvalId: NUL, approved: true }, issues: [{ type: 'item', path: ['approvalId'], message: 'must not contain a NUL character', code: 'value_invalid', received: NUL }] },
        { title: 'approved: missing', input: { approvalId: '0:x:0' }, issues: [{ type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid' }] },
        { title: 'approved: a string', input: { approvalId: '0:x:0', approved: 'true' }, issues: [{ type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid', received: 'true' }] },
        { title: 'approved: a number', input: { approvalId: '0:x:0', approved: 1 }, issues: [{ type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid', received: 1 }] },
        { title: 'reason: a number', input: { approvalId: '0:x:0', approved: true, reason: 1 }, issues: [{ type: 'item', path: ['reason'], message: 'must be a string of 0 to 1000 characters', code: 'value_invalid', received: 1, meta: { optional: true } }] },
        { title: 'reason: null', input: { approvalId: '0:x:0', approved: true, reason: null }, issues: [{ type: 'item', path: ['reason'], message: 'must be a string of 0 to 1000 characters', code: 'value_invalid', received: null, meta: { optional: true } }] },
        { title: 'reason: 1001 characters', input: { approvalId: '0:x:0', approved: true, reason: chars(1001) }, issues: [{ type: 'item', path: ['reason'], message: 'must be a string of 0 to 1000 characters', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'reason: a NUL', input: { approvalId: '0:x:0', approved: true, reason: NUL }, issues: [{ type: 'item', path: ['reason'], message: 'must not contain a NUL character', code: 'value_invalid', received: NUL, meta: { optional: true } }] },
        { title: 'selected: a string', input: { approvalId: '0:x:0', approved: true, selected: 'a' }, issues: [{ type: 'item', path: ['selected'], message: 'must be an array of at most 20 strings', code: 'value_invalid', received: 'a', meta: { optional: true } }] },
        { title: 'selected: null', input: { approvalId: '0:x:0', approved: true, selected: null }, issues: [{ type: 'item', path: ['selected'], message: 'must be an array of at most 20 strings', code: 'value_invalid', received: null, meta: { optional: true } }] },
        { title: 'selected: 21 ids', input: { approvalId: '0:x:0', approved: true, selected: Array.from({ length: 21 }, (_, i) => `o${i}`) }, issues: [{ type: 'item', path: ['selected'], message: 'must be an array of at most 20 strings', code: 'value_invalid', received: ['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9', 'o10', 'o11', 'o12', 'o13', 'o14', 'o15', 'o16', 'o17', 'o18', 'o19', 'o20'], meta: { optional: true } }] },
        { title: 'selected: an id that is a number', input: { approvalId: '0:x:0', approved: true, selected: ['a', 1] }, issues: [{ type: 'item', path: ['selected', 1], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: 1, meta: { optional: true } }] },
        { title: 'selected: an empty id', input: { approvalId: '0:x:0', approved: true, selected: ['a', ''] }, issues: [{ type: 'item', path: ['selected', 1], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: '', meta: { optional: true } }] },
        { title: 'selected: an id of 129 characters', input: { approvalId: '0:x:0', approved: true, selected: [chars(129)] }, issues: [{ type: 'item', path: ['selected', 0], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: chars(129), meta: { optional: true } }] },
        { title: 'selected: an id with a NUL', input: { approvalId: '0:x:0', approved: true, selected: [NUL] }, issues: [{ type: 'item', path: ['selected', 0], message: 'must not contain a NUL character', code: 'value_invalid', received: NUL, meta: { optional: true } }] },
        { title: 'selected: issues of two ids carry their index', input: { approvalId: '0:x:0', approved: true, selected: ['', 'a', 5] }, issues: [{ type: 'group', message: 'Property selected is invalid', data: { name: 'selected' }, path: ['selected'], issues: [{ type: 'item', path: ['selected', 0], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: '', meta: { optional: true } }, { type: 'item', path: ['selected', 2], message: 'must be a string of 1 to 128 characters', code: 'value_invalid', received: 5, meta: { optional: true } }], meta: { optional: true } }] },
        { title: 'reports every field at once', input: { approvalId: 1, approved: 'x', reason: 2, selected: 3 }, issues: [{ type: 'item', path: ['approvalId'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1 }, { type: 'item', path: ['approved'], message: 'must be a boolean', code: 'value_invalid', received: 'x' }, { type: 'item', path: ['reason'], message: 'must be a string of 0 to 1000 characters', code: 'value_invalid', received: 2, meta: { optional: true } }, { type: 'item', path: ['selected'], message: 'must be an array of at most 20 strings', code: 'value_invalid', received: 3, meta: { optional: true } }] },
    ];
    /* eslint-enable @stylistic/object-curly-newline */

    it.each(rows)('$title', async (row) => {
        await verify(new ApprovalValidator(), row);
    });
});
