/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { decodeAttachments } from '../../../src/runs/helpers/index.ts';

describe('decodeAttachments', () => {
    it('decodes each item and keeps its other fields', () => {
        const output = decodeAttachments([{
            mediaType: 'text/plain',
            filename: 'a.txt',
            data: 'aGk=',
        }, { mediaType: 'image/png', data: '' }]);

        expect(output).toEqual([
            {
                mediaType: 'text/plain',
                filename: 'a.txt',
                data: new Uint8Array([104, 105]),
            },
            { mediaType: 'image/png', data: new Uint8Array() },
        ]);
        expect(output.every((item) => !Buffer.isBuffer(item.data))).toBe(true);
    });
});
