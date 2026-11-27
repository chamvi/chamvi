/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, it } from 'vitest';
import { RunValidator } from '@chamvi/core-kit';
import { NUL, chars, verify } from '../../../utils/validator.ts';
import type { Row } from '../../../utils/validator.ts';

describe('RunValidator (the start body)', () => {
    const ATTACHMENT = { mediaType: 'text/plain', data: 'aGk=' };

    /* eslint-disable @stylistic/object-curly-newline -- one issue per line keeps the pinned issues readable */
    const rows: Row[] = [
        { title: 'accepts an empty body', input: {}, output: {} },
        { title: 'accepts a null payload', input: { payload: null }, output: { payload: null } },
        { title: 'accepts every field at its upper bound', input: { payload: { a: 1 }, idempotencyKey: chars(255), address: chars(255), attachments: Array.from({ length: 16 }, () => ({ ...ATTACHMENT, filename: chars(255) })) }, output: { payload: { a: 1 }, idempotencyKey: chars(255), address: chars(255), attachments: Array.from({ length: 16 }, () => ({ ...ATTACHMENT, filename: chars(255) })) } },
        { title: 'drops unknown keys and decodes the attachments', input: { payload: 'hi', other: 1, attachments: [{ ...ATTACHMENT, filename: ' f.txt ', other: 1 }, { mediaType: 'application/octet-stream', data: 'AAEC' }] }, output: { payload: 'hi', attachments: [{ mediaType: 'text/plain', filename: ' f.txt ', data: 'aGk=' }, { mediaType: 'application/octet-stream', data: 'AAEC' }] } },
        { title: 'idempotencyKey: a number', input: { idempotencyKey: 5 }, issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 5, meta: { optional: true } }] },
        { title: 'idempotencyKey: null', input: { idempotencyKey: null }, issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: null, meta: { optional: true } }] },
        { title: 'idempotencyKey: empty', input: { idempotencyKey: '' }, issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }] },
        { title: 'idempotencyKey: 256 characters', input: { idempotencyKey: chars(256) }, issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'idempotencyKey: a NUL', input: { idempotencyKey: NUL }, issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must not contain a NUL character', code: 'value_invalid', received: NUL, meta: { optional: true } }] },
        { title: 'address: a number', input: { address: 5 }, issues: [{ type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 5, meta: { optional: true } }] },
        { title: 'address: empty', input: { address: '' }, issues: [{ type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }] },
        { title: 'address: 256 characters', input: { address: chars(256) }, issues: [{ type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'address: a NUL', input: { address: NUL }, issues: [{ type: 'item', path: ['address'], message: 'must not contain a NUL character', code: 'value_invalid', received: NUL, meta: { optional: true } }] },
        { title: 'attachments: a string', input: { attachments: 'x' }, issues: [{ type: 'item', path: ['attachments'], message: 'must be an array of at most 16 items', code: 'value_invalid', received: 'x', meta: { optional: true } }] },
        { title: 'attachments: an object', input: { attachments: {} }, issues: [{ type: 'item', path: ['attachments'], message: 'must be an array of at most 16 items', code: 'value_invalid', received: {}, meta: { optional: true } }] },
        { title: 'attachments: null', input: { attachments: null }, issues: [{ type: 'item', path: ['attachments'], message: 'must be an array of at most 16 items', code: 'value_invalid', received: null, meta: { optional: true } }] },
        { title: 'attachments: 17 items', input: { attachments: Array.from({ length: 17 }, () => ATTACHMENT) }, issues: [{ type: 'item', path: ['attachments'], message: 'must be an array of at most 16 items', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: an item that is a string', input: { attachments: ['x'] }, issues: [{ type: 'group', message: 'Property attachments is invalid', data: { name: 'attachments' }, path: ['attachments'], issues: [{ type: 'item', path: ['attachments', 0, 'mediaType'], message: 'must be a media type of the form type/subtype', code: 'value_invalid', meta: { optional: true } }, { type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }], meta: { optional: true } }] },
        { title: 'attachments: an empty item', input: { attachments: [{}] }, issues: [{ type: 'group', message: 'Property attachments is invalid', data: { name: 'attachments' }, path: ['attachments'], issues: [{ type: 'item', path: ['attachments', 0, 'mediaType'], message: 'must be a media type of the form type/subtype', code: 'value_invalid', meta: { optional: true } }, { type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }], meta: { optional: true } }] },
        { title: 'attachments: a missing mediaType', input: { attachments: [{ data: 'aGk=' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'mediaType'], message: 'must be a media type of the form type/subtype', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: a missing data', input: { attachments: [{ mediaType: 'text/plain' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: a mediaType that is a number', input: { attachments: [{ ...ATTACHMENT, mediaType: 1 }] }, issues: [{ type: 'item', path: ['attachments', 0, 'mediaType'], message: 'must be a media type of the form type/subtype', code: 'value_invalid', received: 1, meta: { optional: true } }] },
        { title: 'attachments: a mediaType without a subtype', input: { attachments: [{ ...ATTACHMENT, mediaType: 'text' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'mediaType'], message: 'must be a media type of the form type/subtype', code: 'value_invalid', received: 'text', meta: { optional: true } }] },
        { title: 'attachments: a mediaType with parameters', input: { attachments: [{ ...ATTACHMENT, mediaType: 'text/plain; charset=utf-8' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'mediaType'], message: 'must be a media type of the form type/subtype', code: 'value_invalid', received: 'text/plain; charset=utf-8', meta: { optional: true } }] },
        { title: 'attachments: a filename that is a number', input: { attachments: [{ ...ATTACHMENT, filename: 1 }] }, issues: [{ type: 'item', path: ['attachments', 0, 'filename'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 1, meta: { optional: true } }] },
        { title: 'attachments: an empty filename', input: { attachments: [{ ...ATTACHMENT, filename: '' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'filename'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }] },
        { title: 'attachments: a filename of 256 characters', input: { attachments: [{ ...ATTACHMENT, filename: chars(256) }] }, issues: [{ type: 'item', path: ['attachments', 0, 'filename'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: a filename with a NUL', input: { attachments: [{ ...ATTACHMENT, filename: NUL }] }, issues: [{ type: 'item', path: ['attachments', 0, 'filename'], message: 'must not contain a NUL character', code: 'value_invalid', received: NUL, meta: { optional: true } }] },
        { title: 'attachments: data that is a number', input: { attachments: [{ ...ATTACHMENT, data: 1 }] }, issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: data that is no base64', input: { attachments: [{ ...ATTACHMENT, data: 'not base64!' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: unpadded base64', input: { attachments: [{ ...ATTACHMENT, data: 'aGk' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: base64 with non-zero pad bits (one =)', input: { attachments: [{ ...ATTACHMENT, data: 'aGl=' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: base64 with non-zero pad bits (two =)', input: { attachments: [{ ...ATTACHMENT, data: 'aR==' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: canonical padding of both lengths', input: { attachments: [{ ...ATTACHMENT, data: 'aGk=' }, { ...ATTACHMENT, data: 'aQ==' }] }, output: { attachments: [{ ...ATTACHMENT, data: 'aGk=' }, { ...ATTACHMENT, data: 'aQ==' }] } },
        { title: 'attachments: non-zero pad bits reported with the other field issues', input: { address: '', attachments: [{ ...ATTACHMENT, data: 'aGl=' }, ATTACHMENT, { ...ATTACHMENT, data: 'aR==' }] }, issues: [{ type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }, { type: 'group', message: 'Property attachments is invalid', data: { name: 'attachments' }, path: ['attachments'], issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }, { type: 'item', path: ['attachments', 2, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }], meta: { optional: true } }] },
        { title: 'attachments: url-safe base64', input: { attachments: [{ ...ATTACHMENT, data: 'a-k=' }] }, issues: [{ type: 'item', path: ['attachments', 0, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }] },
        { title: 'attachments: issues of two items carry their index', input: { attachments: [ATTACHMENT, { ...ATTACHMENT, mediaType: 1 }, { ...ATTACHMENT, data: 2 }] }, issues: [{ type: 'group', message: 'Property attachments is invalid', data: { name: 'attachments' }, path: ['attachments'], issues: [{ type: 'item', path: ['attachments', 1, 'mediaType'], message: 'must be a media type of the form type/subtype', code: 'value_invalid', received: 1, meta: { optional: true } }, { type: 'item', path: ['attachments', 2, 'data'], message: 'must be strict base64', code: 'value_invalid', meta: { optional: true } }], meta: { optional: true } }] },
        { title: 'reports a field issue per field', input: { idempotencyKey: 5, address: '' }, issues: [{ type: 'item', path: ['idempotencyKey'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: 5, meta: { optional: true } }, { type: 'item', path: ['address'], message: 'must be a string of 1 to 255 characters', code: 'value_invalid', received: '', meta: { optional: true } }] },
    ];
    /* eslint-enable @stylistic/object-curly-newline */

    it.each(rows)('$title', async (row) => {
        await verify(new RunValidator(), row);
    });
});
