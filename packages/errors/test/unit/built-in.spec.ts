/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    BadRequestError,
    ChamviError,
    ConflictError,
    EntityConflictError,
    EntityDeadlockError,
    EntityInvalidError,
    EntityNotFoundError,
    EntityQueryError,
    EntityRelationError,
    ErrorCode,
    ForbiddenError,
    InternalError,
    NotFoundError,
    RequestEntityTooLargeError,
    ServiceUnavailableError,
    TooManyRequestsError,
    UnauthorizedError,
    UnsupportedMediaTypeError,
    ValidationError,
    isBadRequestError,
    isChamviError,
    isConflictError,
    isEntityConflictError,
    isEntityDeadlockError,
    isEntityInvalidError,
    isEntityNotFoundError,
    isEntityQueryError,
    isEntityRelationError,
    isForbiddenError,
    isInternalError,
    isNotFoundError,
    isRequestEntityTooLargeError,
    isServiceUnavailableError,
    isTooManyRequestsError,
    isUnauthorizedError,
    isUnsupportedMediaTypeError,
    isValidationError,
} from '@chamvi/errors';

const roundtrip = (input: unknown) => JSON.parse(JSON.stringify(input));

type Case = {
    name: string,
    create: (input?: string) => ChamviError,
    guard: (input: unknown) => boolean,
    code: string,
    message: string,
};

const CASES: Case[] = [
    {
        name: 'BadRequestError',
        create: (input) => new BadRequestError(input),
        guard: isBadRequestError,
        code: ErrorCode.BAD_REQUEST,
        message: 'Bad Request',
    },
    {
        name: 'UnauthorizedError',
        create: (input) => new UnauthorizedError(input),
        guard: isUnauthorizedError,
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
    },
    {
        name: 'ForbiddenError',
        create: (input) => new ForbiddenError(input),
        guard: isForbiddenError,
        code: ErrorCode.FORBIDDEN,
        message: 'Forbidden',
    },
    {
        name: 'NotFoundError',
        create: (input) => new NotFoundError(input),
        guard: isNotFoundError,
        code: ErrorCode.NOT_FOUND,
        message: 'Not Found',
    },
    {
        name: 'ConflictError',
        create: (input) => new ConflictError(input),
        guard: isConflictError,
        code: ErrorCode.CONFLICT,
        message: 'Conflict',
    },
    {
        name: 'RequestEntityTooLargeError',
        create: (input) => new RequestEntityTooLargeError(input),
        guard: isRequestEntityTooLargeError,
        code: ErrorCode.REQUEST_ENTITY_TOO_LARGE,
        message: 'Request Entity Too Large',
    },
    {
        name: 'UnsupportedMediaTypeError',
        create: (input) => new UnsupportedMediaTypeError(input),
        guard: isUnsupportedMediaTypeError,
        code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        message: 'Unsupported Media Type',
    },
    {
        name: 'TooManyRequestsError',
        create: (input) => new TooManyRequestsError(input),
        guard: isTooManyRequestsError,
        code: ErrorCode.TOO_MANY_REQUESTS,
        message: 'Too Many Requests',
    },
    {
        name: 'ServiceUnavailableError',
        create: (input) => new ServiceUnavailableError(input),
        guard: isServiceUnavailableError,
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Service Unavailable',
    },
    {
        name: 'InternalError',
        create: (input) => new InternalError(input),
        guard: isInternalError,
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal Server Error',
    },
    {
        name: 'ValidationError',
        create: (input) => new ValidationError(input ?? 'invalid'),
        guard: isValidationError,
        code: ErrorCode.VALIDATION,
        message: 'invalid',
    },
    {
        name: 'EntityNotFoundError',
        create: (input) => new EntityNotFoundError(input),
        guard: isEntityNotFoundError,
        code: ErrorCode.ENTITY_NOT_FOUND,
        message: 'Entity not found.',
    },
    {
        name: 'EntityConflictError',
        create: (input) => new EntityConflictError(input),
        guard: isEntityConflictError,
        code: ErrorCode.ENTITY_CONFLICT,
        message: 'Entity conflicts with a stored entity.',
    },
    {
        name: 'EntityRelationError',
        create: (input) => new EntityRelationError(input),
        guard: isEntityRelationError,
        code: ErrorCode.ENTITY_RELATION_INVALID,
        message: 'Entity relation does not exist.',
    },
    {
        name: 'EntityInvalidError',
        create: (input) => new EntityInvalidError(input),
        guard: isEntityInvalidError,
        code: ErrorCode.ENTITY_INVALID,
        message: 'Entity holds a value its table refuses.',
    },
    {
        name: 'EntityQueryError',
        create: (input) => new EntityQueryError(input),
        guard: isEntityQueryError,
        code: ErrorCode.ENTITY_QUERY_INVALID,
        message: 'Entity request is not valid.',
    },
    {
        name: 'EntityDeadlockError',
        create: (input) => new EntityDeadlockError(input),
        guard: isEntityDeadlockError,
        code: ErrorCode.ENTITY_DEADLOCK,
        message: 'Entity could not be written: the transaction deadlocked.',
    },
];

describe.each(CASES)('$name', (entry) => {
    const other = CASES.find((item) => item.name !== entry.name)!;

    it('carries its code and default message', () => {
        const error = entry.create();

        expect(error.code).toEqual(entry.code);
        expect(error.message).toEqual(entry.message);
        expect(isChamviError(error)).toBe(true);
    });

    it('takes a message', () => {
        expect(entry.create('custom').message).toEqual('custom');
    });

    it('is matched by its guard in process and after a JSON round trip', () => {
        expect(entry.guard(entry.create())).toBe(true);
        expect(entry.guard(roundtrip(entry.create()))).toBe(true);
    });

    it('is not matched by the guard of another built-in', () => {
        expect(other.guard(entry.create())).toBe(false);
        expect(entry.guard(other.create())).toBe(false);
    });
});

describe('built-in options', () => {
    it('takes options with data, keeping the code unless overridden', () => {
        const error = new TooManyRequestsError({ message: 'slow down', data: { retryAfter: 5 } });

        expect(error.code).toEqual(ErrorCode.TOO_MANY_REQUESTS);
        expect(error.message).toEqual('slow down');
        expect(error.toJSON()).toMatchObject({ retryAfter: 5 });
    });

    it('matches a rehydrated ChamviError by its code', () => {
        const rehydrated = roundtrip(new ChamviError({ code: ErrorCode.NOT_FOUND }));

        expect(isNotFoundError(rehydrated)).toBe(true);
        expect(isConflictError(rehydrated)).toBe(false);
    });

    it('keeps the issues of a ValidationError', () => {
        const issues = [{
            type: 'item' as const,
            code: 'required',
            path: ['name'],
            message: 'required',
        }];
        const error = new ValidationError('invalid', issues);

        expect(error.issues).toEqual(issues);
    });
});

describe('entity errors', () => {
    it.each([
        [() => new EntityNotFoundError({ entity: 'run' }), 'The run was not found.'],
        [() => new EntityConflictError({ entity: 'run' }), 'The run conflicts with a stored run.'],
        [() => new EntityDeadlockError({ entity: 'run' }), 'The run could not be written: the transaction deadlocked.'],
        [() => new EntityQueryError({ entity: 'run' }), 'The run request is not valid.'],
    ])('names the entity (%#)', (create, message) => {
        const error = create();

        expect(error.message).toBe(message);
        expect(error.entity).toBe('run');
    });

    it('names the referenced entity of a relation error', () => {
        const error = new EntityRelationError({ entity: 'run', relation: 'agent' });

        expect(error.code).toBe(ErrorCode.ENTITY_RELATION_INVALID);
        expect(error.message).toBe("The run's agent does not exist.");
        expect(error.entity).toBe('run');
        expect(error.relation).toBe('agent');
    });

    it('names the operation and, when given, the column or constraint of an invalid entity', () => {
        const error = new EntityInvalidError({
            entity: 'run',
            operation: 'save',
            field: 'status',
        });

        expect(error.message).toBe('The run holds a value its table refuses (save, status).');
        expect(error.entity).toBe('run');
        expect(error.operation).toBe('save');
        expect(error.field).toBe('status');

        const unnamed = new EntityInvalidError({ entity: 'step', operation: 'insert' });

        expect(unnamed.message).toBe('The step holds a value its table refuses (insert).');
        expect(unnamed.field).toBeUndefined();
    });
});

describe('entity errors carry no stored value', () => {
    const SECRET = 'secret-value-4711';

    // as the repositories build them: labels and identifiers, here with a stored value slipped in as an extra option
    it.each([
        ['not found', () => new EntityNotFoundError({ entity: 'run', id: SECRET } as ConstructorParameters<typeof EntityNotFoundError>[0])],
        ['conflict', () => new EntityConflictError({ entity: 'run', key: SECRET } as ConstructorParameters<typeof EntityConflictError>[0])],
        ['deadlock', () => new EntityDeadlockError({ entity: 'lock', id: SECRET } as ConstructorParameters<typeof EntityDeadlockError>[0])],
        ['query', () => new EntityQueryError({ entity: 'run', where: { id: SECRET } } as ConstructorParameters<typeof EntityQueryError>[0])],
        ['relation', () => new EntityRelationError({
            entity: 'step',
            relation: 'run',
            id: SECRET,
        } as ConstructorParameters<typeof EntityRelationError>[0])],
        ['invalid', () => new EntityInvalidError({
            entity: 'run',
            operation: 'save',
            field: 'status',
            value: SECRET,
        } as ConstructorParameters<typeof EntityInvalidError>[0])],
    ])('the %s error carries no passed value', (_, build) => {
        const error = build();

        expect(error.message).not.toContain(SECRET);
        expect(JSON.stringify(error.toJSON())).not.toContain(SECRET);
        expect(JSON.stringify({ ...error })).not.toContain(SECRET);
        expect(error.cause).toBeUndefined();
        expect(error.issues).toEqual([]);
    });
});
