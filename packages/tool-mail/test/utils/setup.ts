/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { afterEach } from 'vitest';
import type { IClock } from '@chamvi/core';
import { createMailClient, mailTools } from '@chamvi/tool-mail';
import type { IMailClient, MailAccount } from '@chamvi/tool-mail';
import { callTool, toolContext } from './context.ts';
import { createFakeImap } from './imap.ts';
import type { FakeImap, FakeImapOptions } from './imap.ts';
import { accountOf, fakeOptions } from './mail.ts';

export type Setup = {
    imap: FakeImap;
    client: IMailClient;
    tools: ToolSet;
    call: <T = unknown>(name: string, input?: unknown) => Promise<T>;
};

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
        await cleanup();
    }
});

/** A fake server, a client of one account `work` on it and the tools over that client; closed after the test. */
export async function setup(
    gmail: boolean,
    options: {
        fake?: Partial<FakeImapOptions>;
        account?: Partial<MailAccount>;
        clock?: IClock;
        timeoutMs?: number;
    } = {},
): Promise<Setup> {
    const imap = await createFakeImap(fakeOptions(gmail, options.fake));
    const client = createMailClient([accountOf(imap.port, 'work', { gmail, ...options.account })], {
        ...(options.clock && { clock: options.clock }),
        ...(options.timeoutMs && { timeoutMs: options.timeoutMs }),
    });

    cleanups.push(async () => {
        await client.close();
        await imap.close();
    });

    const tools = mailTools({ client });

    return {
        imap,
        client,
        tools,
        call: (name, input = {}) => callTool(tools, name, input, toolContext('run-1')),
    };
}
