/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { afterEach } from 'vitest';
import type { IClock } from '@chamvi/core';
import { createMailWriteClient } from '@chamvi/tool-mail';
import type { IMailWriteClient, MailWriteAccount } from '@chamvi/tool-mail';
import { createFakeImap } from './imap.ts';
import type { FakeFolder, FakeImap, FakeImapOptions } from './imap.ts';
import { accountOf, fakeOptions } from './mail.ts';
import { createFakeSmtp } from './smtp.ts';
import type { FakeSmtp, FakeSmtpOptions } from './smtp.ts';

export type WriteSetup = {
    imap: FakeImap;
    smtp: FakeSmtp;
    /** The fake's folders, changed in place by the server. */
    folders: FakeFolder[];
    client: IMailWriteClient;
    account: MailWriteAccount;
};

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
        await cleanup();
    }
});

/**
 * A fake IMAP and a fake SMTP server and a write client of one account `work` (address `bob@y.test`) on
 * them; closed after the test.
 */
export async function setupWrite(
    gmail: boolean,
    options: {
        fake?: Partial<FakeImapOptions>;
        smtp?: FakeSmtpOptions;
        account?: Partial<MailWriteAccount>;
        clock?: IClock;
        timeoutMs?: number;
    } = {},
): Promise<WriteSetup> {
    const fake = fakeOptions(gmail, options.fake);
    const imap = await createFakeImap(fake);
    const smtp = await createFakeSmtp(options.smtp);
    const account: MailWriteAccount = {
        ...accountOf(imap.port, 'work', { gmail, address: 'bob@y.test' }),
        smtp: {
            host: '127.0.0.1',
            port: smtp.port,
            security: 'plain',
        },
        ...options.account,
    };
    const client = createMailWriteClient([account], {
        ...(options.clock && { clock: options.clock }),
        ...(options.timeoutMs && { timeoutMs: options.timeoutMs }),
    });

    cleanups.push(async () => {
        await client.close();
        await imap.close();
        await smtp.close();
    });

    return {
        imap,
        smtp,
        folders: fake.folders,
        client,
        account,
    };
}
