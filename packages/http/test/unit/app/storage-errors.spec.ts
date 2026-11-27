/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    EntityConflictError,
    EntityDeadlockError,
    EntityInvalidError,
    EntityNotFoundError,
    EntityQueryError,
    EntityRelationError,
} from '@chamvi/errors';
import { BaseError } from '@ebec/core';
import { describe, expect, it } from 'vitest';
import { ADMIN_TOKEN, call, createTestApp } from '../../utils/app.ts';

/** A value that must never leave the server: an entity label, a statement value, a credential. */
const MARKER = 'marker-7f3c9a';

/** `@chamvi/store-db`'s DatabaseUnavailableError as http sees it: http maps it by `code`, never by class. */
function databaseUnavailable(): BaseError {
    const error = new BaseError({
        code: 'database_unavailable',
        message: `The database could not complete the ${MARKER} (postgres://chamvi:${MARKER}@db/chamvi).`,
    });

    Object.assign(error, { operation: MARKER, driverCode: MARKER });

    return error;
}

const CASES: [string, () => Error, number, string, string][] = [
    ['EntityNotFoundError', () => new EntityNotFoundError({ entity: MARKER }), 404, 'entity_not_found', 'The requested record was not found.'],
    ['EntityConflictError', () => new EntityConflictError({ entity: MARKER }), 409, 'entity_conflict', 'The record conflicts with a stored record.'],
    [
        'EntityRelationError',
        () => new EntityRelationError({ entity: MARKER, relation: MARKER }),
        400,
        'entity_relation_invalid',
        'The record references a record that does not exist.',
    ],
    [
        'EntityInvalidError',
        () => new EntityInvalidError({
            entity: MARKER,
            operation: MARKER,
            field: MARKER,
        }),
        400,
        'entity_invalid',
        'The record holds a value that is not valid.',
    ],
    ['EntityQueryError', () => new EntityQueryError({ entity: MARKER }), 400, 'entity_query_invalid', 'The request is not a valid query.'],
    [
        'EntityDeadlockError',
        () => new EntityDeadlockError({ entity: MARKER }),
        409,
        'entity_deadlock',
        'The write conflicted with a concurrent write; retry the request.',
    ],
    ['DatabaseUnavailableError', databaseUnavailable, 503, 'database_unavailable', 'The database is unavailable; retry the request.'],
];

describe('storage errors', () => {
    it.each(CASES)('a storage error is rendered with its status, code and fixed message, and no value (%s)', async (_name, create, status, code, message) => {
        const reported: unknown[] = [];
        const { app, engine } = createTestApp({
            onError: (error) => {
                reported.push(error);
            },
        });
        const error = create();

        engine.runService.findOneOrFail = () => Promise.reject(error);

        const response = await call(app, 'GET', '/runs/01900000-0000-7000-8000-000000000001', { token: ADMIN_TOKEN });
        const text = await response.text();

        expect(response.status).toBe(status);
        expect(JSON.parse(text)).toEqual({
            status,
            code,
            message,
        });
        expect(text).not.toContain(MARKER);
        expect(response.headers.values().toArray().join('\n')).not.toContain(MARKER);
        // a server failure reaches onError; a storage refusal of the request does not
        expect(reported).toEqual(status >= 500 ? [error] : []);
    });
});
