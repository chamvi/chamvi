/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    ChamviError,
    EntityDeadlockError,
    EntityNotFoundError,
    EntityRelationError,
    ErrorCode,
    NotFoundError,
    UnauthorizedError,
    httpStatusFromCode,
    httpStatusOf,
} from '@chamvi/errors';

describe('httpStatusFromCode', () => {
    it.each([
        [ErrorCode.VALIDATION, 400],
        [ErrorCode.BAD_REQUEST, 400],
        [ErrorCode.ENTITY_INVALID, 400],
        [ErrorCode.ENTITY_QUERY_INVALID, 400],
        [ErrorCode.ENTITY_RELATION_INVALID, 400],
        [ErrorCode.UNAUTHORIZED, 401],
        [ErrorCode.FORBIDDEN, 403],
        [ErrorCode.NOT_FOUND, 404],
        [ErrorCode.AGENT_NOT_FOUND, 404],
        [ErrorCode.RUN_NOT_FOUND, 404],
        [ErrorCode.ARTIFACT_NOT_FOUND, 404],
        [ErrorCode.REPOSITORY_NOT_FOUND, 404],
        [ErrorCode.ENTITY_NOT_FOUND, 404],
        [ErrorCode.CONFLICT, 409],
        [ErrorCode.AGENT_REPLACED, 409],
        [ErrorCode.CONNECTION_CHANGED, 409],
        [ErrorCode.CONNECTION_HELD, 409],
        [ErrorCode.DECRYPTION_FAILED, 409],
        [ErrorCode.INVALID_RUN_STATE, 409],
        [ErrorCode.ENTITY_CONFLICT, 409],
        [ErrorCode.ENTITY_DEADLOCK, 409],
        [ErrorCode.REQUEST_ENTITY_TOO_LARGE, 413],
        [ErrorCode.UNSUPPORTED_MEDIA_TYPE, 415],
        [ErrorCode.TOO_MANY_REQUESTS, 429],
        [ErrorCode.INTERNAL_ERROR, 500],
        [ErrorCode.SERVICE_UNAVAILABLE, 503],
        [ErrorCode.PEER_START_BUSY, 503],
    ])('serves %s as %i', (code, status) => {
        expect(httpStatusFromCode(code)).toEqual(status);
    });

    it('falls back to bad request for an unknown code', () => {
        expect(httpStatusFromCode('unknown')).toEqual(400);
    });

    it('falls back to the given status for an unknown code', () => {
        expect(httpStatusFromCode('unknown', 500)).toEqual(500);
    });
});

describe('httpStatusOf', () => {
    it('answers a built-in with a code of its own with its class status', () => {
        expect(httpStatusOf(new UnauthorizedError({ message: 'x', code: 'token_expired' }))).toBe(401);
    });

    it('answers a storage error with its code status', () => {
        expect(httpStatusOf(new EntityNotFoundError({ entity: 'run' }))).toBe(404);
        expect(httpStatusOf(new EntityRelationError({ entity: 'step', relation: 'run' }))).toBe(400);
        expect(httpStatusOf(new EntityDeadlockError({ entity: 'lock' }))).toBe(409);
    });

    it('answers a plain chamvi error with an unmapped code with undefined', () => {
        expect(httpStatusOf(new ChamviError({ code: 'unmapped' }))).toBeUndefined();
    });

    it('answers a built-in with a table code with that code status, not its class status', () => {
        expect(httpStatusOf(new NotFoundError())).toBe(404);
        expect(httpStatusOf(new NotFoundError({ code: ErrorCode.RUN_NOT_FOUND }))).toBe(404);
        expect(httpStatusOf(new UnauthorizedError({ code: ErrorCode.CONFLICT }))).toBe(409);
    });
});
