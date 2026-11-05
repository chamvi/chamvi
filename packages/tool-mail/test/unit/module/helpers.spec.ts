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
import { readMailAccountsFromEnv, readSecretVariable } from '../../../src/module/helpers.ts';

const PASSWORD = 'pa55-w0rd-never-echoed';

let dir: string;

beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chamvi-mail-env-'));
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

describe('readMailAccountsFromEnv()', () => {
    it('reads nothing without the variable', () => {
        expect(readMailAccountsFromEnv({})).toBeUndefined();
        expect(readMailAccountsFromEnv({ CHAMVI_MAIL_ACCOUNTS: '' })).toBeUndefined();
    });

    it('defaults the id from the address and the user to the address', () => {
        expect(readMailAccountsFromEnv({
            CHAMVI_MAIL_ACCOUNTS: accounts([{ address: 'Admin@tada5hi.net', host: 'mail.tada5hi.net' }]),
            CHAMVI_MAIL_ADMIN_TADA5HI_NET_PASSWORD: PASSWORD,
        })).toEqual([{
            id: 'admin-tada5hi-net',
            host: 'mail.tada5hi.net',
            user: 'Admin@tada5hi.net',
            password: PASSWORD,
            address: 'Admin@tada5hi.net',
        }]);
    });

    it('takes an explicit id, a user variable and the connection fields', () => {
        expect(readMailAccountsFromEnv({
            CHAMVI_MAIL_ACCOUNTS: accounts([{
                id: 'work',
                address: 'peter@example.com',
                host: 'imap.example.com',
                port: 143,
                security: 'starttls',
                folders: ['INBOX', 'Archive'],
                gmail: false,
            }]),
            CHAMVI_MAIL_WORK_USER: 'peter',
            CHAMVI_MAIL_WORK_PASSWORD: PASSWORD,
        })).toEqual([{
            id: 'work',
            host: 'imap.example.com',
            port: 143,
            security: 'starttls',
            user: 'peter',
            password: PASSWORD,
            address: 'peter@example.com',
            folders: ['INBOX', 'Archive'],
            gmail: false,
        }]);
    });

    it('reads a _FILE variant, trimming one trailing newline', async () => {
        const file = join(dir, 'password');

        await writeFile(file, `${PASSWORD}\n`);

        expect(readMailAccountsFromEnv({
            CHAMVI_MAIL_ACCOUNTS: accounts([{
                id: 'me', 
                address: 'me@gmail.com', 
                host: 'imap.gmail.com', 
            }]),
            CHAMVI_MAIL_ME_PASSWORD_FILE: file,
        })?.[0]?.password).toBe(PASSWORD);
    });

    it('refuses both forms of one variable', async () => {
        const file = join(dir, 'both');

        await writeFile(file, PASSWORD);

        const error = errorOf(() => readMailAccountsFromEnv({
            CHAMVI_MAIL_ACCOUNTS: accounts([{
                id: 'me', 
                address: 'me@gmail.com', 
                host: 'imap.gmail.com', 
            }]),
            CHAMVI_MAIL_ME_PASSWORD: PASSWORD,
            CHAMVI_MAIL_ME_PASSWORD_FILE: file,
        }));

        expect(error.message).toContain('CHAMVI_MAIL_ME_PASSWORD');
        expect(error.message).toContain('CHAMVI_MAIL_ME_PASSWORD_FILE');
    });

    it('refuses an unreadable _FILE', () => {
        const error = errorOf(() => readMailAccountsFromEnv({
            CHAMVI_MAIL_ACCOUNTS: accounts([{
                id: 'me', 
                address: 'me@gmail.com', 
                host: 'imap.gmail.com', 
            }]),
            CHAMVI_MAIL_ME_PASSWORD_FILE: join(dir, 'missing'),
        }));

        expect(error.message).toContain('CHAMVI_MAIL_ME_PASSWORD_FILE');
    });

    it('names the missing password variable', () => {
        const error = errorOf(() => readMailAccountsFromEnv({ CHAMVI_MAIL_ACCOUNTS: accounts([{ address: 'admin@tada5hi.net', host: 'mail.tada5hi.net' }]) }));

        expect(error.message).toContain('CHAMVI_MAIL_ADMIN_TADA5HI_NET_PASSWORD');
    });

    it('names the variable for bad JSON', () => {
        const error = errorOf(() => readMailAccountsFromEnv({ CHAMVI_MAIL_ACCOUNTS: `[{"password":"${PASSWORD}"` }));

        expect(error.message).toContain('CHAMVI_MAIL_ACCOUNTS');
    });

    it.each([
        ['not an array', { address: 'me@x.test', host: 'imap.x.test' }, 'CHAMVI_MAIL_ACCOUNTS must be'],
        ['not an object', ['me'], 'CHAMVI_MAIL_ACCOUNTS[0]'],
        ['no address', [{ id: 'me', host: 'imap.x.test' }], 'CHAMVI_MAIL_ACCOUNTS[0].address'],
        ['a bad id', [{
            id: 'Me_1', 
            address: 'me@x.test', 
            host: 'imap.x.test', 
        }], 'CHAMVI_MAIL_ACCOUNTS[0].id'],
        ['no host', [{ id: 'me', address: 'me@x.test' }], 'CHAMVI_MAIL_ACCOUNTS[0].host'],
        ['a bad port', [{
            id: 'me', 
            address: 'me@x.test', 
            host: 'imap.x.test', 
            port: 'x', 
        }], 'CHAMVI_MAIL_ACCOUNTS[0].port'],
        ['a bad security', [{
            id: 'me', 
            address: 'me@x.test', 
            host: 'imap.x.test', 
            security: 'ssl', 
        }], 'CHAMVI_MAIL_ACCOUNTS[0].security'],
        ['bad folders', [{
            id: 'me', 
            address: 'me@x.test', 
            host: 'imap.x.test', 
            folders: 'INBOX', 
        }], 'CHAMVI_MAIL_ACCOUNTS[0].folders'],
        ['a bad gmail', [{
            id: 'me', 
            address: 'me@x.test', 
            host: 'imap.x.test', 
            gmail: 'yes', 
        }], 'CHAMVI_MAIL_ACCOUNTS[0].gmail'],
        [
            'a duplicate id',
            [{
                id: 'me', 
                address: 'me@x.test', 
                host: 'imap.x.test', 
            }, { address: 'me', host: 'imap.x.test' }],
            'CHAMVI_MAIL_ACCOUNTS[1].id',
        ],
    ])('refuses %s', (_, value, message) => {
        const error = errorOf(() => readMailAccountsFromEnv({
            CHAMVI_MAIL_ACCOUNTS: accounts(value),
            CHAMVI_MAIL_ME_PASSWORD: PASSWORD,
        }));

        expect(error.message).toContain(message);
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
