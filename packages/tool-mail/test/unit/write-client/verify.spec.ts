/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { normalizeAccount } from '../../../src/options/module.ts';
import { verifySmtpLogin } from '../../../src/write-client/smtp.ts';
import type { MailSmtpAccount } from '../../../src/write-client/types.ts';
import { accountOf } from '../../utils/mail.ts';
import { createFakeSmtp } from '../../utils/smtp.ts';
import type { FakeSmtp, FakeSmtpOptions } from '../../utils/smtp.ts';

const servers: FakeSmtp[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function setup(options: FakeSmtpOptions = {}): Promise<{ smtp: FakeSmtp; account: MailSmtpAccount }> {
    const smtp = await createFakeSmtp(options);

    servers.push(smtp);

    return {
        smtp,
        account: {
            ...normalizeAccount(accountOf(1), 'account'),
            smtp: {
                host: '127.0.0.1',
                port: smtp.port,
                security: 'plain',
            },
        },
    };
}

describe('verifySmtpLogin()', () => {
    it('logs in and quits', async () => {
        const { smtp, account } = await setup();

        await verifySmtpLogin(account, new AbortController().signal);

        await vi.waitFor(() => expect(smtp.commands).toContain('QUIT'));
        await vi.waitFor(() => expect(smtp.connections()).toBe(0));
    });

    it('refuses a wrong login with a fixed sentence', async () => {
        const { account } = await setup({ authFails: true });

        await expect(verifySmtpLogin(account, new AbortController().signal)).rejects.toThrow('The SMTP server refused the user or password.');
    });

    it('closes its connection when aborted while the server holds the reply', async () => {
        const { smtp, account } = await setup({ hold: /^AUTH/i });
        const controller = new AbortController();
        const verifying = verifySmtpLogin(account, controller.signal);

        await vi.waitFor(() => expect(smtp.commands.some((command) => command.startsWith('AUTH'))).toBe(true));
        expect(smtp.connections()).toBe(1);

        controller.abort(new Error('stop'));

        await expect(verifying).rejects.toThrow('stop');
        await vi.waitFor(() => expect(smtp.connections()).toBe(0));
    });
});
