/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { join } from 'node:path';
import { createMemoryStore } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { AppToken } from '@chamvi/app';
import { NO_AGENTS_MESSAGE } from '../../../../src/modules/agents/constants.ts';
import {
    START,
    agentFile,
    buildAgentsDirHarness,
    codeAgent,
    queueRun,
} from '../../../utils/agents-dir.ts';
import type { AgentsDirHarnessOptions } from '../../../utils/agents-dir.ts';
import { createTempDir, writeTree } from '../../../utils/folder.ts';
import type { Harness } from '../../../utils/harness.ts';
import { installPackage } from '../../../utils/packages.ts';

let tmp: Awaited<ReturnType<typeof createTempDir>>;
let cwd: string;
const harnesses: Harness[] = [];

beforeEach(async () => {
    tmp = await createTempDir();
    cwd = join(tmp.path, 'app');
    await writeTree(cwd, { 'package.json': '{ "name": "app", "private": true }\n' });
});

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses.length = 0;
    await tmp.remove();
});

function build(options: Omit<AgentsDirHarnessOptions, 'cwd'>) {
    const setup = buildAgentsDirHarness({ cwd, ...options });

    harnesses.push(setup.harness);

    return setup;
}

describe('package agents', () => {
    it('registers a package agent at its version marker', async () => {
        await installPackage(cwd, '@s/greeter', { version: '1.2.0' });

        const setup = build({ packages: ['@s/greeter'] });

        await setup.harness.setup();

        expect(setup.engine().getAgent('greeter')).toBeDefined();
        expect(setup.engine().agentRevision('greeter')).toBe('@s/greeter@1.2.0');
        expect((await setup.store.agentRevisions.findOne('greeter'))?.hash).toBe('@s/greeter@1.2.0');
        // registered for a package-only app (no agents dir)
        expect(setup.issues()).toEqual([]);
        expect(setup.logger.entries.some((entry) => entry.msg.startsWith('the app has no agents'))).toBe(false);
    });

    it('reads chamvi.json agents and CHAMVI_AGENTS after createApp\'s', async () => {
        await installPackage(cwd, 'a', { agents: ['one'] });
        await installPackage(cwd, 'b', { agents: ['two'] });
        await installPackage(cwd, 'c', { agents: ['three'] });
        await writeTree(cwd, { 'chamvi.json': JSON.stringify({ agents: ['b'] }) });

        // the config file is the engine module's: located from the process cwd, here named absolutely
        const setup = build({ packages: ['a'], env: { CHAMVI_AGENTS: 'c,b', CHAMVI_CONFIG_FILE: join(cwd, 'chamvi.json') } });

        await setup.harness.setup();

        expect(setup.engine().listAgents().map((agent) => agent.name)).toEqual(['one', 'two', 'three']);
    });

    it('reads chamvi.json from the process cwd like the model settings, not the module cwd', async () => {
        await installPackage(cwd, 'b', { agents: ['two'] });
        await writeTree(cwd, { 'chamvi.json': JSON.stringify({ agents: ['b'] }) });

        const setup = build({ agents: [codeAgent('one')] });

        await setup.harness.setup();

        expect(setup.engine().getAgent('two')).toBeUndefined();
    });

    it('fails on an invalid chamvi.json agents field without calling it a model setting', async () => {
        await writeTree(cwd, { 'app.json': JSON.stringify({ agents: ['./x'] }) });

        const setup = build({ env: { CHAMVI_CONFIG_FILE: join(cwd, 'app.json') } });
        const attempt = setup.harness.setup();

        await expect(attempt).rejects.toThrow(
            'CHAMVI_CONFIG_FILE: app.json: agents[0] is no bare package specifier (a package name such as @acme/agents, no path or URL).',
        );
        await expect(attempt).rejects.not.toThrow('model settings');
    });

    it('lets a code agent win a name, the package agent being an issue', async () => {
        await installPackage(cwd, '@s/greeter');

        const setup = build({ packages: ['@s/greeter'], agents: [codeAgent('greeter')] });

        await setup.harness.setup();

        expect(setup.engine().agentRevision('greeter')).toBeUndefined();
        expect(setup.issues()).toEqual([expect.objectContaining({
            agent: 'greeter',
            message: 'greeter: a code agent has this name; package @s/greeter is not loaded.',
        })]);
    });

    it.each([
        [['first', 'second'], 'first'],
        [['second', 'first'], 'second'],
    ])('lets the earlier package win a name (%j)', async (order, winner) => {
        await installPackage(cwd, 'first', { version: '1.0.0' });
        await installPackage(cwd, 'second', { version: '2.0.0' });

        const setup = build({ packages: order });

        await setup.harness.setup();

        const loser = order.find((spec) => spec !== winner);

        expect(setup.engine().agentRevision('greeter')).toBe(winner === 'first' ? 'first@1.0.0' : 'second@2.0.0');
        expect(setup.issues()).toEqual([expect.objectContaining({
            agent: 'greeter',
            message: `greeter: package ${winner} already provides this agent; package ${loser} is not loaded.`,
        })]);
    });

    it('lets a package win over a folder, also when the package agent fails its check', async () => {
        await installPackage(cwd, 'ok', { agents: ['greeter'] });
        await installPackage(cwd, 'broken', { agents: ['keeper'], extra: ', channels: [{ channel: \'nope\', id: \'nope\', options: {} }]' });
        await writeTree(cwd, {
            'agents/greeter/agent.ts': agentFile('from folder'),
            'agents/keeper/agent.ts': agentFile('from folder', 'test/model', 'keeper'),
        });

        const setup = build({ packages: ['ok', 'broken'] });

        await setup.harness.setup();

        expect(setup.engine().agentRevision('greeter')).toBe('ok@1.0.0');
        expect(setup.engine().getAgent('keeper')).toBeUndefined();

        const messages = setup.issues().map((issue) => issue.message);

        expect(messages).toContain('greeter: package ok provides this agent; the folder is not loaded.');
        expect(messages).toContain('keeper: package broken provides this agent; the folder is not loaded.');
        expect(messages.some((message) => message.startsWith('keeper (broken): ') && message.includes('nope'))).toBe(true);
    });

    it('starts the rest when a package does not resolve, keeping every marker', async () => {
        await installPackage(cwd, 'ok', { agents: ['greeter'] });
        await writeTree(cwd, { 'agents/folder/agent.ts': agentFile('from folder', 'test/model', 'folder') });

        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });

        await store.agentRevisions.save({
            agent: 'elsewhere',
            hash: 'h1',
            changedAt: clock.now(),
        });

        const runId = await queueRun(store, clock, 'elsewhere');
        const setup = build({
            packages: ['@s/missing', 'ok'],
            agents: [codeAgent('coded')],
            clock,
            store,
        });

        await setup.harness.setup();

        expect(setup.engine().listAgents().map((agent) => agent.name).sort()).toEqual(['coded', 'folder', 'greeter']);
        expect(setup.issues()).toEqual([expect.objectContaining({
            agent: '@s/missing',
            message: '@s/missing: not found from the app\'s directory; add it to the app\'s dependencies.',
        })]);
        expect(await store.agentRevisions.findOne('elsewhere')).toBeDefined();
        expect((await store.runs.findOne(runId))?.status).toBe('queued');
        expect(setup.logger.entries.some((entry) => entry.msg === 'a package agent did not load; no agent is removed')).toBe(true);
    });

    it('removes an orphan marker but never a package agent\'s once every package loaded', async () => {
        await installPackage(cwd, 'ok', { agents: ['greeter'] });
        await writeTree(cwd, { 'agents/folder/agent.ts': agentFile('from folder', 'test/model', 'folder') });

        const clock = new ControllableClock(START);
        const store = createMemoryStore({ clock });

        await store.agentRevisions.save({
            agent: 'elsewhere',
            hash: 'h1',
            changedAt: clock.now(),
        });

        const setup = build({
            packages: ['ok'],
            clock,
            store,
        });

        await setup.harness.setup();

        expect(await store.agentRevisions.findOne('elsewhere')).toBeUndefined();
        expect((await store.agentRevisions.findOne('greeter'))?.hash).toBe('ok@1.0.0');
    });

    it('registers AGENT_ISSUES for a package-only app', async () => {
        await installPackage(cwd, 'ok');

        const setup = build({ packages: ['ok'] });

        await setup.harness.setup();

        expect(setup.harness.container.has(AppToken.AGENT_ISSUES)).toBe(true);
    });

    it('warns without code agents, packages or an agents dir', async () => {
        const setup = build({});

        await setup.harness.setup();

        expect(setup.logger.entries.some((entry) => entry.msg === NO_AGENTS_MESSAGE)).toBe(true);
    });
});
