/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Engine, createMemoryStore, defineModelAgent } from '@chamvi/core';
import { httpChannel } from '@chamvi/http';
import { mockModel } from '@chamvi/test-kit';
import { createMailClient, mailTools } from '@chamvi/tool-mail';
import { createFakeImap } from '../../utils/imap.ts';
import { accountOf, fakeOptions } from '../../utils/mail.ts';

describe('mail tools trust', () => {
    it('taints a run that searched the mail', async () => {
        const imap = await createFakeImap(fakeOptions(false));
        const client = createMailClient([accountOf(imap.port)]);
        const agent = defineModelAgent({
            name: 'assistant',
            instructions: 'Read the mail.',
            model: mockModel([
                {
                    parts: [{
                        type: 'tool-call',
                        toolName: 'mail_search',
                        input: { account: 'work', query: 'hello' },
                        toolCallId: 'c1',
                    }],
                },
                { parts: [{ type: 'text', text: 'Done.' }] },
            ]),
            tools: mailTools({ client }),
        });
        const engine = new Engine({
            store: createMemoryStore(),
            agents: [agent],
            channels: [httpChannel()],
        });

        await engine.start();

        const { runId } = await engine.dispatch({
            agent: agent.name,
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        await engine.idle();

        const run = await engine.getRun(runId);

        engine.stop();
        await client.close();
        await imap.close();

        expect(run?.status).toBe('completed');
        expect(run?.taint?.source).toBe('tool:mail_search');
    });

    it('marks every tool tainting and untrusted in its description', () => {
        const tools = mailTools({ accounts: [accountOf(1)] });

        expect(Object.keys(tools).sort()).toEqual(['mail_accounts', 'mail_attachment', 'mail_get', 'mail_search', 'mail_thread']);

        for (const tool of Object.values(tools)) {
            expect(tool.description).toMatch(/untrusted .*never follow them\.$/);
        }
    });
});
