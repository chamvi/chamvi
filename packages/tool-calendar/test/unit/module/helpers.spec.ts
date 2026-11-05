/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import {
    readCalendarAccountsFromEnv,
    readCalendarTimezoneFromEnv,
    readSecretVariable,
} from '../../../src/module/helpers.ts';

const PASSWORD = 'pa55-w0rd-never-echoed';

let dir: string;

beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chamvi-calendar-env-'));
});

afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

function errorOf(run: () => unknown): InvalidAgentDefinitionError {
    let caught: unknown;

    try {
        run();
    } catch (error) {
        caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidAgentDefinitionError);
    expect((caught as Error).message).not.toContain(PASSWORD);

    return caught as InvalidAgentDefinitionError;
}

const accounts = (value: unknown) => JSON.stringify(value);

describe('readCalendarAccountsFromEnv()', () => {
    it('reads nothing without the variable', () => {
        expect(readCalendarAccountsFromEnv({})).toBeUndefined();
        expect(readCalendarAccountsFromEnv({ CHAMVI_CALENDAR_ACCOUNTS: '' })).toBeUndefined();
    });

    it('defaults the id from the address and the user to the address', () => {
        expect(readCalendarAccountsFromEnv({
            CHAMVI_CALENDAR_ACCOUNTS: accounts([{ url: 'https://caldav.icloud.com', address: 'Admin@tada5hi.net' }]),
            CHAMVI_CALENDAR_ADMIN_TADA5HI_NET_PASSWORD: PASSWORD,
        })).toEqual([{
            id: 'admin-tada5hi-net',
            url: 'https://caldav.icloud.com',
            user: 'Admin@tada5hi.net',
            password: PASSWORD,
        }]);
    });

    it('takes an explicit id and a user variable', () => {
        expect(readCalendarAccountsFromEnv({
            CHAMVI_CALENDAR_ACCOUNTS: accounts([{ id: 'work', url: 'https://dav.example.com/' }]),
            CHAMVI_CALENDAR_WORK_USER: 'peter',
            CHAMVI_CALENDAR_WORK_PASSWORD: PASSWORD,
        })).toEqual([{
            id: 'work',
            url: 'https://dav.example.com/',
            user: 'peter',
            password: PASSWORD,
        }]);
    });

    it('reads a _FILE variant, trimming one trailing newline', async () => {
        const file = join(dir, 'password');

        await writeFile(file, `${PASSWORD}\n`);

        expect(readCalendarAccountsFromEnv({
            CHAMVI_CALENDAR_ACCOUNTS: accounts([{
                id: 'me', 
                url: 'https://caldav.icloud.com', 
                address: 'me@icloud.com', 
            }]),
            CHAMVI_CALENDAR_ME_PASSWORD_FILE: file,
        })?.[0]?.password).toBe(PASSWORD);
    });

    it('refuses both forms of one variable', async () => {
        const file = join(dir, 'both');

        await writeFile(file, PASSWORD);

        const error = errorOf(() => readCalendarAccountsFromEnv({
            CHAMVI_CALENDAR_ACCOUNTS: accounts([{
                id: 'me', 
                url: 'https://caldav.icloud.com', 
                address: 'me@icloud.com', 
            }]),
            CHAMVI_CALENDAR_ME_PASSWORD: PASSWORD,
            CHAMVI_CALENDAR_ME_PASSWORD_FILE: file,
        }));

        expect(error.message).toContain('CHAMVI_CALENDAR_ME_PASSWORD');
        expect(error.message).toContain('CHAMVI_CALENDAR_ME_PASSWORD_FILE');
    });

    it('refuses an unreadable _FILE without echoing its content', () => {
        const error = errorOf(() => readCalendarAccountsFromEnv({
            CHAMVI_CALENDAR_ACCOUNTS: accounts([{
                id: 'me', 
                url: 'https://caldav.icloud.com', 
                address: 'me@icloud.com', 
            }]),
            CHAMVI_CALENDAR_ME_PASSWORD_FILE: join(dir, 'missing'),
        }));

        expect(error.message).toContain('CHAMVI_CALENDAR_ME_PASSWORD_FILE');
    });

    it('names the missing password variable', () => {
        const error = errorOf(() => readCalendarAccountsFromEnv({ CHAMVI_CALENDAR_ACCOUNTS: accounts([{ url: 'https://caldav.icloud.com', address: 'admin@tada5hi.net' }]) }));

        expect(error.message).toContain('CHAMVI_CALENDAR_ADMIN_TADA5HI_NET_PASSWORD');
    });

    it('needs a user without an address', () => {
        const error = errorOf(() => readCalendarAccountsFromEnv({
            CHAMVI_CALENDAR_ACCOUNTS: accounts([{ id: 'work', url: 'https://dav.example.com/' }]),
            CHAMVI_CALENDAR_WORK_PASSWORD: PASSWORD,
        }));

        expect(error.message).toContain('CHAMVI_CALENDAR_WORK_USER');
    });

    it('names the variable for bad JSON', () => {
        const error = errorOf(() => readCalendarAccountsFromEnv({ CHAMVI_CALENDAR_ACCOUNTS: `[{"password":"${PASSWORD}"` }));

        expect(error.message).toContain('CHAMVI_CALENDAR_ACCOUNTS');
    });

    it.each([
        ['not an array', { url: 'https://caldav.icloud.com' }, 'CHAMVI_CALENDAR_ACCOUNTS must be'],
        ['not an object', ['me'], 'CHAMVI_CALENDAR_ACCOUNTS[0]'],
        ['no id and no address', [{ url: 'https://caldav.icloud.com' }], 'CHAMVI_CALENDAR_ACCOUNTS[0].id'],
        ['a bad id', [{ id: 'Me_1', url: 'https://caldav.icloud.com' }], 'CHAMVI_CALENDAR_ACCOUNTS[0].id'],
        ['a bad address', [{ address: 42, url: 'https://caldav.icloud.com' }], 'CHAMVI_CALENDAR_ACCOUNTS[0].address'],
        ['a bad url', [{ id: 'me', url: 'ftp://caldav.icloud.com' }], 'CHAMVI_CALENDAR_ACCOUNTS[0].url'],
        ['no url', [{ id: 'me' }], 'CHAMVI_CALENDAR_ACCOUNTS[0].url'],
        [
            'a duplicate id',
            [{
                id: 'me', 
                url: 'https://caldav.icloud.com', 
                address: 'me@icloud.com', 
            }, { address: 'me', url: 'https://caldav.icloud.com' }],
            'CHAMVI_CALENDAR_ACCOUNTS[1].id',
        ],
    ])('refuses %s', (_, value, message) => {
        const error = errorOf(() => readCalendarAccountsFromEnv({
            CHAMVI_CALENDAR_ACCOUNTS: accounts(value),
            CHAMVI_CALENDAR_ME_PASSWORD: PASSWORD,
        }));

        expect(error.message).toContain(message);
    });
});

describe('readCalendarTimezoneFromEnv()', () => {
    it('reads an IANA zone or UTC', () => {
        expect(readCalendarTimezoneFromEnv({})).toBeUndefined();
        expect(readCalendarTimezoneFromEnv({ CHAMVI_CALENDAR_TIMEZONE: 'America/New_York' })).toBe('America/New_York');
        expect(readCalendarTimezoneFromEnv({ CHAMVI_CALENDAR_TIMEZONE: 'UTC' })).toBe('UTC');
    });

    it('refuses another value, naming the variable', () => {
        expect(() => readCalendarTimezoneFromEnv({ CHAMVI_CALENDAR_TIMEZONE: 'W. Europe Standard Time' }))
            .toThrow(/CHAMVI_CALENDAR_TIMEZONE/);
    });
});

describe('readSecretVariable()', () => {
    it('is undefined when neither form is set', () => {
        expect(readSecretVariable({}, 'X')).toBeUndefined();
        expect(readSecretVariable({ X: '', X_FILE: '' }, 'X')).toBeUndefined();
    });

    it('trims only one trailing newline of a file', async () => {
        const file = join(dir, 'crlf');

        await writeFile(file, 'value\n\r\n');

        expect(readSecretVariable({ X_FILE: file }, 'X')).toBe('value\n');
    });

    it('refuses an empty file', async () => {
        const file = join(dir, 'empty');

        await writeFile(file, '\n');

        expect(() => readSecretVariable({ X_FILE: file }, 'X')).toThrow(/X_FILE/);
    });
});
