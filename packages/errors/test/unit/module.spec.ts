/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { IssueCode, defineIssueItem } from '@ebec/core';
import { describe, expect, it } from 'vitest';
import {
    BadRequestError,
    ChamviError,
    ErrorCode,
    INSTANCEOF_PROPERTY,
} from '@chamvi/errors';

describe('ChamviError', () => {
    it('carries issues passed through the constructor', () => {
        const issue = defineIssueItem({
            code: IssueCode.REQUIRED,
            path: ['name'],
            message: 'Name is required',
        });
        const error = new ChamviError({ message: 'validation failed', issues: [issue] });

        expect(error.issues).toEqual([issue]);
    });

    it('defaults issues to an empty array and keeps a string message', () => {
        const error = new ChamviError('nope');

        expect(error.message).toEqual('nope');
        expect(error.issues).toEqual([]);
        expect(error.data).toBeUndefined();
    });

    it('keeps the data payload next to the base fields', () => {
        const error = new ChamviError({ code: 'x', data: { retryAfter: 30 } });

        expect(error.data).toEqual({ retryAfter: 30 });
        expect(error.toJSON()).toMatchObject({
            name: error.name,
            code: 'x',
            retryAfter: 30,
        });
    });

    it('does not let a data key displace code, message or name', () => {
        const error = new ChamviError({
            code: 'x',
            message: 'real',
            data: {
                code: 'other',
                message: 'fake',
                name: 'y',
            },
        });

        const output = error.toJSON();

        expect(output.code).toEqual('x');
        expect(output.message).toEqual('real');
        expect(output.name).toEqual(error.name);
    });

    it('emits the serialized marker chain, which a data key cannot displace', () => {
        const error = new BadRequestError({ data: { [INSTANCEOF_PROPERTY]: ['@chamvi/errors/InternalError'] } });
        const output = error.toJSON();

        expect(output.code).toEqual(ErrorCode.BAD_REQUEST);
        expect(output[INSTANCEOF_PROPERTY]).toEqual([
            '@ebec/core/BaseError',
            '@chamvi/errors/ChamviError',
            '@chamvi/errors/BadRequestError',
        ]);
    });
});
