/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hostname } from 'node:os';
import { describe, expect, it } from 'vitest';
import { isSameDatabase } from '../../../src/migration/index.ts';

const BASE = 'postgres://app:secret@db.example:5432/app';

describe('isSameDatabase', () => {
    it.each([
        ['the same URL', BASE],
        ['postgresql: for postgres:', 'postgresql://app:secret@db.example:5432/app'],
        ['the host in upper case', 'postgres://app:secret@DB.Example:5432/app'],
        ['a trailing dot on the host', 'postgres://app:secret@db.example.:5432/app'],
        ['the default port left out', 'postgres://app:secret@db.example/app'],
        ['a trailing slash', 'postgres://app:secret@db.example:5432/app/'],
        ['the name percent-encoded', 'postgres://app:secret@db.example:5432/%61pp'],
        ['the name in another case', 'postgres://app:secret@db.example:5432/APP'],
        ['a query string', 'postgres://app:secret@db.example:5432/app?sslmode=require&application_name=x'],
        ['another user and password', 'postgres://other:pw@db.example:5432/app'],
        ['no credentials at all', 'postgres://db.example:5432/app'],
        ['the host given as a query parameter', 'postgres://app:secret@elsewhere:5432/app?host=db.example'],
        ['the port given as a query parameter', 'postgres://app:secret@db.example/app?port=5432'],
        ['the database given as a query parameter', 'postgres://app:secret@db.example:5432/other?dbname=app'],
        ['no database: the user\'s name', 'postgres://app:secret@db.example:5432'],
    ])('names one database: %s', (_, other) => {
        expect(isSameDatabase(BASE, other)).toBe(true);
        expect(isSameDatabase(other, BASE)).toBe(true);
    });

    it.each([
        ['localhost', '127.0.0.1'],
        ['localhost', '[::1]'],
        ['127.0.0.1', '[::1]'],
        ['127.0.0.1', '127.1'],
        ['localhost', '[0:0:0:0:0:0:0:1]'],
        ['localhost', '[::ffff:127.0.0.1]'],
        ['LOCALHOST', '127.0.0.2'],
        ['localhost', hostname()],
        ['localhost', '%2Fvar%2Frun%2Fpostgresql'],
    ])('names one database on this machine: %s and %s', (a, b) => {
        expect(isSameDatabase(`postgres://u:p@${a}:5432/app`, `postgres://u:p@${b}:5432/app`)).toBe(true);
    });

    it('names one database on this machine through a socket in the query', () => {
        expect(isSameDatabase('postgres://u:p@localhost/app', 'postgres://u:p@/app?host=/var/run/postgresql')).toBe(true);
    });

    it.each([
        ['another database', 'postgres://app:secret@db.example:5432/scratch'],
        ['another host', 'postgres://app:secret@db2.example:5432/app'],
        ['another port', 'postgres://app:secret@db.example:5433/app'],
        ['another database on this machine', 'postgres://app:secret@localhost:5432/app'],
    ])('tells apart %s', (_, other) => {
        expect(isSameDatabase(BASE, other)).toBe(false);
        expect(isSameDatabase(other, BASE)).toBe(false);
    });

    it('errs towards one database for a URL it cannot read', () => {
        expect(isSameDatabase(BASE, 'not a url')).toBe(true);
        expect(isSameDatabase('mysql://app@db.example/app', BASE)).toBe(true);
    });

    it('errs towards one database when neither a database nor a user is named', () => {
        expect(isSameDatabase('postgres://db.example', 'postgres://db.example:5432/anything')).toBe(true);
    });
});
