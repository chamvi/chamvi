/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { describe, expect, it } from 'vitest';
import {
    EntityConflictError,
    EntityDeadlockError,
    EntityInvalidError,
    EntityNotFoundError,
    EntityQueryError,
    EntityRelationError,
    StoreErrorCode,
} from '@chamvi/store';

const SECRET = 'secret-value-4711';

type Construct = new (...args: unknown[]) => BaseError;

describe('storage errors', () => {
    it.each([
        [EntityNotFoundError, 'entity_not_found', 'The run was not found.'],
        [EntityConflictError, 'entity_conflict', 'The run conflicts with a stored run.'],
        [EntityDeadlockError, 'entity_deadlock', 'The run could not be written: the transaction deadlocked.'],
        [EntityQueryError, 'entity_query_invalid', 'The run request is not valid.'],
    ] as const)('%o has its code and a fixed message', (Error, code, message) => {
        const error = new Error('run');

        expect(error).toBeInstanceOf(BaseError);
        expect(error.code).toBe(code);
        expect(error.message).toBe(message);
        expect(error.entity).toBe('run');
    });

    it('names the referenced entity of a relation error', () => {
        const error = new EntityRelationError('run', 'agent');

        expect(error).toBeInstanceOf(BaseError);
        expect(error.code).toBe('entity_relation_invalid');
        expect(error.message).toBe("The run's agent does not exist.");
        expect(error.entity).toBe('run');
        expect(error.relation).toBe('agent');
        expect(new EntityRelationError('step', 'run').message).toBe("The step's run does not exist.");
    });

    it('names the operation and, when given, the column or constraint of an invalid entity', () => {
        const error = new EntityInvalidError('run', 'save', 'status');

        expect(error).toBeInstanceOf(BaseError);
        expect(error.code).toBe('entity_invalid');
        expect(error.message).toBe('The run holds a value its table refuses (save, status).');
        expect(error.entity).toBe('run');
        expect(error.operation).toBe('save');
        expect(error.field).toBe('status');
        expect(new EntityInvalidError('step', 'insert').message).toBe('The step holds a value its table refuses (insert).');
        expect(new EntityInvalidError('step', 'insert').field).toBeUndefined();
    });

    it('exposes the codes', () => {
        expect(StoreErrorCode).toEqual({
            ENTITY_CONFLICT: 'entity_conflict',
            ENTITY_DEADLOCK: 'entity_deadlock',
            ENTITY_INVALID: 'entity_invalid',
            ENTITY_NOT_FOUND: 'entity_not_found',
            ENTITY_QUERY_INVALID: 'entity_query_invalid',
            ENTITY_RELATION_INVALID: 'entity_relation_invalid',
        });
    });

    it.each([
        ['not found', () => new (EntityNotFoundError as unknown as Construct)('run', SECRET, { id: SECRET })],
        ['conflict', () => new (EntityConflictError as unknown as Construct)('run', SECRET, { id: SECRET })],
        ['deadlock', () => new (EntityDeadlockError as unknown as Construct)('run', SECRET, { id: SECRET })],
        ['invalid', () => new (EntityInvalidError as unknown as Construct)('run', 'save', undefined, SECRET, { id: SECRET })],
        ['query', () => new (EntityQueryError as unknown as Construct)('run', SECRET, { id: SECRET })],
        ['relation', () => new (EntityRelationError as unknown as Construct)('run', 'agent', SECRET, { id: SECRET })],
    ])('the %s error carries no passed value', (_, build) => {
        const error = build();

        expect(error.message).not.toContain(SECRET);
        expect(JSON.stringify(error.toJSON())).not.toContain(SECRET);
        expect(error.cause).toBeUndefined();
        expect(error.issues).toEqual([]);
    });
});
