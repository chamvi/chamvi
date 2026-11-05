/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Engine, createMemoryStore } from '@chamvi/core';
import { httpChannel } from '@chamvi/http';
import { mockModel } from '@chamvi/test-kit';
import type { MailSearchResult } from '@chamvi/tool-mail';
import { createInboxAgent } from '../fixtures/readme-example.ts';
import { createFakeImap } from '../utils/imap.ts';
import { PASSWORD, fakeOptions, untagged } from '../utils/mail.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('README example', () => {
    it('is the code of test/fixtures/readme-example.ts', () => {
        const readme = read('../../README.md');
        const blocks = readme.matchAll(/```typescript\n([\s\S]*?)```/g).map((m) => m[1]).toArray();

        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });

    it('gives the agent the five mail tools and the http channel', () => {
        const agent = createInboxAgent(mockModel([]), 'secret');

        expect(Object.keys(agent.definition.tools as object)).toEqual([
            'mail_accounts',
            'mail_search',
            'mail_get',
            'mail_attachment',
            'mail_thread',
        ]);
        expect(agent.definition.channels?.map((subscription) => subscription.channel)).toEqual(['http']);
    });

    it('searches the mail on the IMAP server without changing it', async () => {
        const imap = await createFakeImap(fakeOptions(false));
        const agent = createInboxAgent(mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'mail_search',
                    input: { account: 'gmail', query: 'hello' },
                    toolCallId: 'c1',
                }],
            },
            { parts: [{ type: 'text', text: 'Bob said hello.' }] },
        ]), PASSWORD, {
            host: '127.0.0.1',
            port: imap.port,
            security: 'plain',
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
        const steps = await engine.store.steps.find(runId);
        const search = steps.find((step) => step.kind === 'tool' && step.name === 'mail_search');

        engine.stop();
        await imap.close();

        expect(run?.status).toBe('completed');
        expect(run?.taint?.source).toBe('tool:mail_search');
        expect((search?.output as MailSearchResult).mails.map((mail) => mail.subject)).toContain('Hello');
        expect(untagged(imap.commands).some((command) => /^(UID )?(SELECT|STORE)\b/.test(command))).toBe(false);
    });
});
