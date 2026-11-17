/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { errorField } from '../../../src/error/helpers.ts';
import { DatabaseUnavailableError, errorCode, maskDatabaseUrl } from '../../../src/error/index.ts';

describe('database errors', () => {
    it('maskDatabaseUrl hides the credentials of every URL in a text', () => {
        expect(maskDatabaseUrl('connect postgres://admin:s3cret@db.local:5432/app failed'))
            .toBe('connect postgres://***@db.local:5432/app failed');
        expect(maskDatabaseUrl('postgresql://admin@db/app and mysql://u:p@h/x'))
            .toBe('postgresql://***@db/app and mysql://***@h/x');
        expect(maskDatabaseUrl('postgres://db.local/app')).toBe('postgres://db.local/app');
        expect(maskDatabaseUrl('no url here')).toBe('no url here');
    });

    it('maskDatabaseUrl hides an encoded password and one written raw with characters that end a URL\'s user info', () => {
        expect(maskDatabaseUrl('connect postgres://content:s3cret%2Fpass@db.example:5432/content failed'))
            .toBe('connect postgres://***@db.example:5432/content failed');

        for (const password of ['long/secret-1', 'long#secret-1', 'long?secret-1', 'a/b', 'p@ss/word-1']) {
            const text = `connect postgres://content:${password}@db.example:5432/content failed`;

            expect(maskDatabaseUrl(text), password).toBe('connect postgres://***@db.example:5432/content failed');
        }

        // a short password is masked as part of the URL only: `app` alone is part of ordinary words
        expect(maskDatabaseUrl('the app at postgres://u:app@h/db failed')).toBe('the app at postgres://***@h/db failed');
        expect(maskDatabaseUrl('connect postgres://db.example/content?sslmode=require&password=q-s3cret failed'))
            .toBe('connect postgres://db.example/content?sslmode=require&password=*** failed');
        expect(maskDatabaseUrl('connect postgres://db.example/content?password=q-s3cret&sslmode=require'))
            .toBe('connect postgres://db.example/content?password=***&sslmode=require');
        expect(maskDatabaseUrl('postgres://u:p@db/x?PASSWORD=q-s3cret')).toBe('postgres://***@db/x?PASSWORD=***');
        expect(maskDatabaseUrl('nothing to hide at postgres://content@db/content'))
            .toBe('nothing to hide at postgres://***@db/content');
    });

    it('errorCode reads the driver\'s code', () => {
        expect(errorCode({ driverError: { code: '23505' }, code: 'other' })).toBe('23505');
        expect(errorCode({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe('SQLITE_CONSTRAINT_UNIQUE');
        expect(errorCode({ code: 42 })).toBeUndefined();
        expect(errorCode(new Error('plain'))).toBeUndefined();
        expect(errorCode('text')).toBeUndefined();
        expect(errorCode(undefined)).toBeUndefined();
    });

    it('DatabaseUnavailableError carries the operation and the driver code, never a cause', () => {
        const error = new DatabaseUnavailableError('save', '23502');

        expect(error.code).toBe('database_unavailable');
        expect(error.operation).toBe('save');
        expect(error.driverCode).toBe('23502');
        expect(error.cause).toBeUndefined();
        expect(error.message).toBe('The database could not complete the save (23502).');
        expect(new DatabaseUnavailableError('findMany').message).toBe('The database could not complete the findMany.');
    });

    it('errorField takes a column or constraint identifier only, never other text of the error', () => {
        expect(errorField({
            driverError: {
                code: '23502',
                column: 'label',
                message: 'secret',
            },
        })).toBe('label');
        expect(errorField({ driverError: { code: '23514', constraint: 'counter_check' } })).toBe('counter_check');
        expect(errorField({ code: 'SQLITE_CONSTRAINT_NOTNULL', message: 'NOT NULL constraint failed: parents.label' })).toBe('label');
        expect(errorField({ code: 'SQLITE_CONSTRAINT_CHECK', message: 'CHECK constraint failed: counter_check' })).toBe('counter_check');
        // an unnamed CHECK names its expression, which may hold a literal
        expect(errorField({ code: 'SQLITE_CONSTRAINT_CHECK', message: "CHECK constraint failed: name <> 'secret'" })).toBeUndefined();
        expect(errorField({ driverError: { code: '22001', message: 'value too long' } })).toBeUndefined();
        expect(errorField('text')).toBeUndefined();
    });
});
