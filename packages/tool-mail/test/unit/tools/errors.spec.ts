/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    ChamviError,
    ContextNotProvidedError,
    InvalidAgentDefinitionError,
    ValidationError,
} from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    MAIL_REQUEST_ERROR_CODE,
    MAIL_TIMEOUT_MS,
    createMailClient,
    encodeMailId,
    mailTools,
} from '@chamvi/tool-mail';
import { callTool, toolContext } from '../../utils/context.ts';
import { createFakeImap } from '../../utils/imap.ts';
import {
    PASSWORD,
    accountOf,
    fakeOptions,
    untagged,
} from '../../utils/mail.ts';
import { setup } from '../../utils/setup.ts';

async function rejection(promise: Promise<unknown>): Promise<ChamviError> {
    try {
        await promise;
    } catch (error) {
        return error as ChamviError;
    }

    throw new Error('expected a rejection');
}

describe('forged and stale mail ids', () => {
    it('refuses a changed UIDVALIDITY as stale', async () => {
        const { call } = await setup(false);
        const id = encodeMailId({
            account: 'work',
            folder: 'INBOX',
            uidValidity: '41',
            uid: 1,
        });

        await expect(call('mail_get', { id })).rejects.toThrow(ValidationError);
        await expect(call('mail_get', { id })).rejects.toThrow('mail id is stale, search again');
    });

    it('refuses a uid the folder does not hold as stale', async () => {
        const { call } = await setup(false);
        const id = encodeMailId({
            account: 'work',
            folder: 'INBOX',
            uidValidity: '42',
            uid: 99,
        });

        await expect(call('mail_get', { id })).rejects.toThrow('mail id is stale, search again');
    });

    it.each([
        ['an unknown account', encodeMailId({
            account: 'home',
            folder: 'INBOX',
            uidValidity: '42',
            uid: 1,
        })],
        ['an unlisted folder', encodeMailId({
            account: 'work',
            folder: 'Nope',
            uidValidity: '42',
            uid: 1,
        })],
        ['a bad id', 'work:INBOX:42:one'],
    ])('refuses %s without opening a folder', async (_, id) => {
        const { call, imap } = await setup(false);

        for (const tool of ['mail_get', 'mail_attachment', 'mail_thread']) {
            await expect(call(tool, { id, index: 0 })).rejects.toThrow(ValidationError);
        }

        expect(untagged(imap.commands).filter((command) => command.startsWith('EXAMINE'))).toEqual([]);
    });

    it('refuses a folder outside the configured folders without opening it', async () => {
        const { call, imap } = await setup(false, { account: { folders: ['INBOX'] } });
        const id = encodeMailId({
            account: 'work',
            folder: 'Archive',
            uidValidity: '42',
            uid: 7,
        });

        await expect(call('mail_get', { id })).rejects.toThrow(ValidationError);
        expect(untagged(imap.commands).filter((command) => command.startsWith('EXAMINE'))).toEqual([]);
    });
});

describe('request failures', () => {
    it('reports a refused login without the password or the server text', async () => {
        const { call } = await setup(false, { fake: { loginFails: true } });
        const error = await rejection(call('mail_search', { account: 'work' }));

        expect(error).toBeInstanceOf(ChamviError);
        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_search: work: login failed');
        expect(JSON.stringify({
            ...error,
            message: error.message,
            stack: error.stack,
        })).not.toContain(PASSWORD);
        expect(error.message).not.toContain('secret-server-text');
    });

    it('reports a server it cannot reach', async () => {
        const imap = await createFakeImap(fakeOptions(false));
        const { port } = imap;

        await imap.close();

        const client = createMailClient([accountOf(port)]);
        const error = await rejection(callTool(mailTools({ client }), 'mail_accounts', {}, toolContext('run-1')));

        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_accounts: work: cannot connect');
        await client.close();
    });

    it('times out on the clock when the server does not answer', async () => {
        const clock = new ControllableClock();
        const { call, imap } = await setup(false, { clock, fake: { hold: /UID SEARCH/ } });
        const pending = rejection(call('mail_search', { account: 'work' }));

        await expect.poll(() => untagged(imap.commands).some((command) => command.startsWith('UID SEARCH'))).toBe(true);
        clock.advance(MAIL_TIMEOUT_MS);

        const error = await pending;

        expect(error.code).toBe(MAIL_REQUEST_ERROR_CODE);
        expect(error.message).toBe('mail_search: work: timed out');
    });

    it('reconnects after a timeout dropped the connection', async () => {
        const clock = new ControllableClock();
        const { call, imap } = await setup(false, { clock, fake: { hold: /UID SEARCH TEXT never/ } });
        const pending = rejection(call('mail_search', {
            account: 'work',
            query: 'never',
            folder: 'INBOX',
        }));

        await expect.poll(() => untagged(imap.commands).some((command) => command.startsWith('UID SEARCH'))).toBe(true);
        clock.advance(MAIL_TIMEOUT_MS);
        expect((await pending).message).toBe('mail_search: work: timed out');

        const result = await call<{ mails: unknown[] }>('mail_search', { account: 'work', folder: 'INBOX' });

        expect(result.mails).toHaveLength(2);
        expect(untagged(imap.commands).filter((command) => command.startsWith('LOGIN'))).toHaveLength(2);
    });
});

describe('the client source', () => {
    it('needs accounts, a client or the provided context', async () => {
        await expect(callTool(mailTools(), 'mail_accounts', {}, toolContext('run-1'))).rejects.toThrow(ContextNotProvidedError);
    });

    it('connects to the given accounts', async () => {
        const imap = await createFakeImap(fakeOptions(false));
        const accounts = await callTool<{ account: string }[]>(
            mailTools({ accounts: [accountOf(imap.port, 'home')] }),
            'mail_accounts',
            {},
            toolContext('run-1'),
        );

        expect(accounts.map((account) => account.account)).toEqual(['home']);
        await imap.close();
    });

    it.each([
        [{ accounts: [accountOf(1, 'Bad Id')] }, /id/],
        [{ accounts: [accountOf(1, 'a'), accountOf(2, 'a')] }, /duplicate/],
        [{ accounts: [{ ...accountOf(1), password: '' }] }, /password/],
        [{ accounts: [{ ...accountOf(1), security: 'ssl' }] }, /security/],
        [{ accounts: [{ ...accountOf(1), port: 70000 }] }, /port/],
        [{ timeoutMs: 0 }, /timeoutMs/],
        [{ client: {} }, /client/],
    ])('refuses the options %j', (options, message) => {
        expect(() => mailTools(options as never)).toThrow(InvalidAgentDefinitionError);
        expect(() => mailTools(options as never)).toThrow(message);
    });
});
