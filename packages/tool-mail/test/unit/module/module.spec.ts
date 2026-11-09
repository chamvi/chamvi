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
} from 'vitest';
import {
    InvalidAgentDefinitionError,
    createMemoryStore,
    defineModelAgent,
} from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import {
    AppToken,
    ModuleName,
    configModule,
    createLogger,
    engineModule,
    runHooks,
    storeModule,
} from '@chamvi/app';
import type { IModule } from '@chamvi/app';
import { buildModuleHarness, createModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness, ModuleHarnessOptions } from '@chamvi/app/testing';
import { mailTools } from '@chamvi/tool-mail';
import type { MailSearchResult } from '@chamvi/tool-mail';
import {
    MAIL_ACCOUNTS_VARIABLE,
    TOOL_MAIL_MODULE_NAME,
    ToolMailModule,
    toolMailModule,
} from '@chamvi/tool-mail/module';
import { createFakeImap } from '../../utils/imap.ts';
import type { FakeImap } from '../../utils/imap.ts';
import {
    PASSWORD,
    accountOf,
    fakeOptions,
    untagged,
} from '../../utils/mail.ts';

const harnesses: ModuleHarness[] = [];
const servers: FakeImap[] = [];

afterEach(async () => {
    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }

    for (const server of servers.splice(0)) {
        await server.close();
    }
});

async function fake(): Promise<FakeImap> {
    const server = await createFakeImap(fakeOptions(false));

    servers.push(server);

    return server;
}

function envOf(port: number): Record<string, string> {
    return {
        [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([{
            id: 'work',
            address: 'bob@y.test',
            host: '127.0.0.1',
            port,
            security: 'plain',
        }]),
        CHAMVI_MAIL_WORK_PASSWORD: PASSWORD,
    };
}

/** An agent searching the mail with the module's client (no accounts of its own), in each of `runs` runs. */
function assistantAgent(runs = 1): Agent {
    return defineModelAgent({
        name: 'assistant',
        instructions: 'Read the mail.',
        model: mockModel(Array.from({ length: runs }, (_, index): MockResponse[] => [
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'mail_search',
                    input: { account: 'work', query: 'hello' },
                    toolCallId: `c${index}`,
                }],
            },
            { parts: [{ type: 'text', text: 'Done.' }] },
        ]).flat()),
        tools: mailTools(),
    });
}

async function harnessOf(module: IModule, options: Omit<ModuleHarnessOptions, 'modules'> = {}): Promise<ModuleHarness> {
    const harness = buildModuleHarness({
        ...options,
        modules: [
            configModule({ logger: createLogger({ level: 'error', write: () => {} }) }),
            storeModule(),
            engineModule(),
            module,
        ],
    });

    harnesses.push(harness);
    await harness.setup();

    return harness;
}

async function runAssistant(harness: ModuleHarness) {
    const engine = harness.container.resolve(AppToken.ENGINE);
    const { runId } = await engine.dispatch({
        agent: 'assistant',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await engine.idle();

    const run = await engine.store.runs.findOne(runId);
    const step = (await engine.store.steps.find(runId))
        .find((entry) => entry.kind === 'tool' && entry.name === 'mail_search');

    return { run, step };
}

const logins = (server: FakeImap) => untagged(server.commands).filter((command) => command.startsWith('LOGIN')).length;

describe('toolMailModule()', () => {
    it('is named chamvi:tool-mail and needs the config, store and engine modules', () => {
        const module = toolMailModule({ env: {} });

        expect(module).toBeInstanceOf(ToolMailModule);
        expect(module.name).toBe(TOOL_MAIL_MODULE_NAME);
        expect(module.dependencies).toEqual([ModuleName.CONFIG, ModuleName.STORE, ModuleName.ENGINE]);
    });

    it('provides the env accounts\' client to tools without accounts', async () => {
        const server = await fake();
        const harness = await harnessOf(toolMailModule({ env: envOf(server.port) }), { agents: [assistantAgent()] });
        const { run, step } = await runAssistant(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toBeUndefined();
        expect((step?.output as MailSearchResult).mails.length).toBeGreaterThan(0);
        expect(untagged(server.commands).find((command) => command.startsWith('LOGIN'))).toContain('bob@y.test');
        expect(harness.reported).toEqual([]);
    });

    it('takes the accounts option over the env', async () => {
        const server = await fake();
        const harness = await harnessOf(toolMailModule({
            env: { [MAIL_ACCOUNTS_VARIABLE]: '[' },
            accounts: [accountOf(server.port, 'work', { user: 'code@y.test' })],
        }), { agents: [assistantAgent()] });
        const { run } = await runAssistant(harness);

        expect(run?.status).toBe('completed');
        expect(untagged(server.commands).find((command) => command.startsWith('LOGIN'))).toContain('code@y.test');
    });

    it('keeps the context provided without accounts: the tool fails with connection_not_configured', async () => {
        const harness = await harnessOf(toolMailModule({ env: {} }), { agents: [assistantAgent()] });
        const { run, step } = await runAssistant(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toMatchObject({ code: 'connection_not_configured' });
    });

    it('closes the client once the engine drained: the next call logs in again', async () => {
        const server = await fake();
        const harness = await harnessOf(toolMailModule({ env: envOf(server.port) }), { agents: [assistantAgent(3)] });

        await runAssistant(harness);
        expect(logins(server)).toBe(1);

        // a second call reuses the connection
        await runAssistant(harness);
        expect(logins(server)).toBe(1);

        await runHooks(harness.container, 'drained');

        expect(untagged(server.commands)).toContain('LOGOUT');

        const { step } = await runAssistant(harness);

        expect(step?.error).toBeUndefined();
        expect(logins(server)).toBe(2);
    });

    it('closes the client on teardown', async () => {
        const server = await fake();
        const harness = await harnessOf(toolMailModule({ env: envOf(server.port) }), { agents: [assistantAgent()] });

        await runAssistant(harness);
        await harness.stop();
        harnesses.length = 0;

        expect(untagged(server.commands)).toContain('LOGOUT');
    });

    it('checks the env and the options when the factory is called, never echoing a password', () => {
        const messageOf = (run: () => unknown): string => {
            try {
                run();
            } catch (error) {
                expect(error).toBeInstanceOf(InvalidAgentDefinitionError);

                return (error as Error).message;
            }

            throw new Error('expected a throw');
        };

        expect(messageOf(() => toolMailModule({ env: { [MAIL_ACCOUNTS_VARIABLE]: '{' } }))).toContain(MAIL_ACCOUNTS_VARIABLE);
        expect(messageOf(() => toolMailModule({ env: { [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([{ address: 'admin@tada5hi.net', host: 'mail.tada5hi.net' }]) } }))).toContain('CHAMVI_MAIL_ADMIN_TADA5HI_NET_PASSWORD');
        expect(messageOf(() => toolMailModule({ accounts: [accountOf(1, 'work', { port: 0 })] }))).not.toContain(PASSWORD);
        expect(() => toolMailModule({ env: 'nope' as never })).toThrow(InvalidAgentDefinitionError);
        expect(() => toolMailModule('nope' as never)).toThrow(InvalidAgentDefinitionError);
    });

    it('does nothing in migrate mode', async () => {
        const server = await fake();
        const harness = await createModuleHarness({
            mode: 'migrate',
            env: { DATABASE_URL: 'postgres://chamvi@127.0.0.1:1/chamvi' },
            modules: [
                configModule({ logger: createLogger({ level: 'error', write: () => {} }) }),
                storeModule({ store: createMemoryStore() }),
                engineModule(),
                toolMailModule({ env: envOf(server.port) }),
            ],
        });

        harnesses.push(harness);
        expect(harness.container.resolveAll(AppToken.LIFECYCLE_HOOKS).filter((hook) => hook.name === TOOL_MAIL_MODULE_NAME)).toEqual([]);
        expect(server.commands).toEqual([]);
    });
});
