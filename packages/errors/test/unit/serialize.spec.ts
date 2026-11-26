/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    ErrorCode,
    INSTANCEOF_PROPERTY,
    UnauthorizedError,
    isUnauthorizedError,
    serializeError,
} from '@chamvi/errors';

describe('serializeError', () => {
    it('embeds the serialized chain of a ChamviError', () => {
        const output = serializeError(new UnauthorizedError());

        expect(output[INSTANCEOF_PROPERTY]).toEqual([
            '@ebec/core/BaseError',
            '@chamvi/errors/ChamviError',
            '@chamvi/errors/UnauthorizedError',
        ]);
        expect(output.code).toEqual(ErrorCode.UNAUTHORIZED);
        expect(isUnauthorizedError(JSON.parse(JSON.stringify(output)))).toBe(true);
    });

    it('spreads a plain error with its name and message', () => {
        const error = Object.assign(new Error('foo'), { extra: 1 });

        expect(serializeError(error)).toEqual({
            extra: 1,
            name: 'Error',
            message: 'foo',
        });
    });

    it('falls back when toJSON returns a non-object', () => {
        const error = Object.assign(new Error('foo'), { toJSON: () => 'x' });
        const output = serializeError(error);

        expect(output.name).toEqual('Error');
        expect(output.message).toEqual('foo');
    });
});
