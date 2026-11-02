/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { join } from 'node:path';
import { InvalidRunStateError, createMemoryStore } from '@chamvi/core';
import type { IStore } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { hashAgentPackage } from '@chamvi/app';
import { ORPHANS_KEPT_MESSAGE } from '../../../../src/modules/agents/constants.ts';
import {
    START,
    agentFile,
    buildAgentsDirHarness,
    queueRun,
} from '../../../utils/agents-dir.ts';
import type { AgentsDirHarnessOptions } from '../../../utils/agents-dir.ts';
import { createTempDir, writeTree } from '../../../utils/folder.ts';
import type { Harness } from '../../../utils/harness.ts';
import { installPackage } from '../../../utils/packages.ts';

let tmp: Awaited<ReturnType<typeof createTempDir>>;
let cwd: string;
let clock: ControllableClock;
let store: IStore;
const harnesses: Harness[] = [];

beforeEach(async () => {
    tmp = await createTempDir();
    cwd = join(tmp.path, 'app');
    clock = new ControllableClock(START);
    store = createMemoryStore({ clock });
    await writeTree(cwd, { 'package.json': '{ "name": "app", "private": true }\n' });
});

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses.length = 0;
    await tmp.remove();
});

/** One lifecycle (a process) over the shared store. */
async function boot(options: Omit<AgentsDirHarnessOptions, 'cwd' | 'clock' | 'store'> = {}) {
    const setup = buildAgentsDirHarness({
        cwd,
        clock,
        store,
        packages: ['@s/greeter'],
        ...options,
    });

    harnesses.push(setup.harness);
    await setup.harness.setup();

    return setup;
}

async function stopAll() {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses.length = 0;
}

const statusOf = async (runId: string) => (await store.runs.findOne(runId))?.status;
const packageDir = () => join(cwd, 'node_modules', '@s', 'greeter');

describe('package agent revisions in production', () => {
    it('keeps the runs when the content changes without a version bump', async () => {
        await installPackage(cwd, '@s/greeter', { files: { 'tool.mjs': 'v1' } });
        await boot();
        await stopAll();

        const runId = await queueRun(store, clock, 'greeter');

        await writeTree(packageDir(), { 'tool.mjs': 'v2' });
        await boot();

        // the start ran it: never cancelled
        expect(await statusOf(runId)).not.toBe('cancelled');
    });

    it('cancels the unsettled runs once on a new version, logging the full marker', async () => {
        await installPackage(cwd, '@s/greeter', { version: '1.0.0' });
        await boot();
        await stopAll();

        const runId = await queueRun(store, clock, 'greeter');

        clock.advance(1_000);
        await installPackage(cwd, '@s/greeter', { version: '1.1.0' });

        const setup = await boot();

        expect(await statusOf(runId)).toBe('cancelled');
        expect((await store.runs.findOne(runId))?.error?.message).toBe(
            'Agent "greeter" was reloaded at revision @s/greeter@1.1.0; its unsettled runs were cancelled.',
        );
        expect(setup.logger.entries.find((entry) => entry.msg === 'agent reloaded')).toMatchObject({
            agent: 'greeter',
            revision: '@s/greeter@1.1.0',
            cancelled: [runId],
        });
    });
});

describe('package agent revisions in dev', () => {
    it('marks the content hash and cancels on a change without a version bump', async () => {
        await installPackage(cwd, '@s/greeter', { files: { 'tool.mjs': 'v1' } });
        await boot({ dev: true });

        const hash = await hashAgentPackage(packageDir());

        expect((await store.agentRevisions.findOne('greeter'))?.hash).toBe(`@s/greeter@1.0.0+${hash.slice(0, 12)}`);
        await stopAll();

        const runId = await queueRun(store, clock, 'greeter');

        clock.advance(1_000);
        await writeTree(packageDir(), { 'tool.mjs': 'v2' });
        await boot({ dev: true });

        expect(await statusOf(runId)).toBe('cancelled');
    });

    it('moves between the production and dev markers of one version without a cancel', async () => {
        await installPackage(cwd, '@s/greeter');
        await boot();
        await stopAll();

        const changedAt = (await store.agentRevisions.findOne('greeter'))?.changedAt;
        const runId = await queueRun(store, clock, 'greeter');

        clock.advance(1_000);
        await writeTree(packageDir(), { 'extra.mjs': 'edited in dev' });
        await boot({ dev: true });
        await stopAll();

        expect((await store.agentRevisions.findOne('greeter'))?.hash).toMatch(/^@s\/greeter@1\.0\.0\+[0-9a-f]{12}$/);
        expect(await statusOf(runId)).not.toBe('cancelled');

        const second = await queueRun(store, clock, 'greeter');

        clock.advance(1_000);
        await boot();

        const marker = await store.agentRevisions.findOne('greeter');

        expect(marker?.hash).toBe('@s/greeter@1.0.0');
        expect(marker?.changedAt).toEqual(changedAt);
        expect(await statusOf(second)).not.toBe('cancelled');
    });
});

describe('package agent revisions in a job', () => {
    it('fails the job of an agent whose stored version differs while it has unsettled runs', async () => {
        await installPackage(cwd, '@s/greeter', { version: '1.0.0' });
        await boot();
        await stopAll();

        const runId = await queueRun(store, clock, 'greeter');

        await installPackage(cwd, '@s/greeter', { version: '2.0.0' });

        const attempt = boot({ mode: 'job', job: { agent: 'greeter' } });

        await expect(attempt).rejects.toThrow(InvalidRunStateError);
        await expect(attempt).rejects.toThrow(
            'greeter (@s/greeter): Agent "greeter" runs revision @s/greeter@1.0.0 in the store, not @s/greeter@2.0.0; this process does not reload agents. A job never reloads an agent',
        );
        expect(await statusOf(runId)).toBe('queued');
    });

    it('runs a job of another agent beside the conflict, the conflict an issue', async () => {
        await installPackage(cwd, '@s/greeter', { version: '1.0.0' });
        await installPackage(cwd, 'other', { agents: ['other'] });
        await boot();
        await stopAll();
        await queueRun(store, clock, 'greeter');
        await installPackage(cwd, '@s/greeter', { version: '2.0.0' });

        const setup = await boot({
            mode: 'job',
            job: { agent: 'other' },
            packages: ['@s/greeter', 'other'],
        });

        expect(setup.engine().getAgent('other')).toBeDefined();
        expect(setup.issues().map((issue) => issue.agent)).toEqual(['greeter']);
    });
});

describe('package agents across restarts', () => {
    const failing = () => Promise.reject(new Error('boom at import'));

    it('keeps a folder of the same name from taking over while the package does not load', async () => {
        const root = join(cwd, 'agents');

        await installPackage(cwd, '@s/greeter');
        await writeTree(root, { 'greeter/agent.ts': agentFile('from folder') });
        await boot({ root });
        await stopAll();

        const runId = await queueRun(store, clock, 'greeter');

        clock.advance(1_000);

        const setup = await boot({ root, importer: failing });

        expect(await statusOf(runId)).toBe('queued');
        expect((await store.agentRevisions.findOne('greeter'))?.hash).toBe('@s/greeter@1.0.0');
        expect(setup.engine().getAgent('greeter')).toBeUndefined();
        expect(setup.issues()).toContainEqual(expect.objectContaining({
            agent: 'greeter',
            message: 'greeter: a package that did not load may provide this agent; the folder is not loaded.',
        }));
    });

    it('removes a package agent that is gone without an agents dir', async () => {
        await installPackage(cwd, '@s/greeter', { agents: ['greeter', 'other'] });
        await boot();
        await stopAll();

        const runId = await queueRun(store, clock, 'other');

        clock.advance(1_000);
        await installPackage(cwd, '@s/greeter', { version: '2.0.0', agents: ['greeter'] });
        // a query busts Node's module cache, as a new process would
        await boot({ importer: (url) => import(`${url}?v=2`) });

        expect(await statusOf(runId)).toBe('cancelled');
        expect((await store.runs.findOne(runId))?.error?.code).toBe('agent_removed');
        expect(await store.agentRevisions.findOne('other')).toBeUndefined();
        expect((await store.agentRevisions.findOne('greeter'))?.hash).toBe('@s/greeter@2.0.0');
    });

    it('removes the agents of a package dropped from the list without an agents dir', async () => {
        await installPackage(cwd, '@s/greeter');
        await installPackage(cwd, 'other', { agents: ['other'] });
        await boot({ packages: ['@s/greeter', 'other'] });
        await stopAll();

        const runId = await queueRun(store, clock, 'other');

        clock.advance(1_000);
        await boot();

        expect(await statusOf(runId)).toBe('cancelled');
        expect(await store.agentRevisions.findOne('other')).toBeUndefined();
    });

    it('keeps every marker while a package does not load, without an agents dir', async () => {
        await installPackage(cwd, '@s/greeter');
        await installPackage(cwd, 'other', { agents: ['other'] });
        await boot({ packages: ['@s/greeter', 'other'] });
        await stopAll();

        const runId = await queueRun(store, clock, 'other');

        clock.advance(1_000);

        const setup = await boot({ packages: ['@s/greeter', 'other'], importer: (url) => (url.includes('/other/') ? failing() : import(url)) });

        expect(await statusOf(runId)).toBe('queued');
        expect((await store.agentRevisions.findOne('other'))?.hash).toBe('other@1.0.0');
        expect(setup.logger.entries.some((entry) => entry.msg === ORPHANS_KEPT_MESSAGE)).toBe(true);
    });

    it('removes the package agents once the last package left the list, keeping folder markers', async () => {
        await installPackage(cwd, 'other', { agents: ['other'] });
        await boot({ packages: ['other'] });
        await stopAll();

        const folderHash = 'ab'.repeat(32);

        await store.agentRevisions.save({
            agent: 'folder', 
            hash: folderHash, 
            changedAt: clock.now(), 
        });

        const runId = await queueRun(store, clock, 'other');

        clock.advance(1_000);
        await boot({ packages: [] });

        expect(await statusOf(runId)).toBe('cancelled');
        expect((await store.runs.findOne(runId))?.error?.code).toBe('agent_removed');
        expect(await store.agentRevisions.findOne('other')).toBeUndefined();
        expect((await store.agentRevisions.findOne('folder'))?.hash).toBe(folderHash);
    });

    it('keeps folder markers in a package-only start without an agents dir', async () => {
        await installPackage(cwd, '@s/greeter');

        const folderHash = 'cd'.repeat(32);

        await store.agentRevisions.save({
            agent: 'folder', 
            hash: folderHash, 
            changedAt: clock.now(), 
        });

        const runId = await queueRun(store, clock, 'folder');

        await boot();

        expect(await statusOf(runId)).toBe('queued');
        expect((await store.agentRevisions.findOne('folder'))?.hash).toBe(folderHash);
    });

    it('keeps the issue of a failed package when another package exports an agent of its name', async () => {
        await installPackage(cwd, 'broken', { agents: ['spare'] });
        await installPackage(cwd, 'second', { agents: ['broken'] });

        const setup = await boot({ packages: ['broken', 'second'], importer: (url) => (url.includes('/broken/') ? failing() : import(url)) });

        expect(setup.issues()).toContainEqual(expect.objectContaining({ agent: 'broken', message: expect.stringContaining('boom at import') }));
        expect((await store.agentRevisions.findOne('broken'))?.hash).toBe('second@1.0.0');
    });
});
