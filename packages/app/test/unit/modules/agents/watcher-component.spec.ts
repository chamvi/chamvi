/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IEngine } from '@chamvi/core';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { AppToken } from '@chamvi/app';
import { POLL_MS, agentFile, buildAgentsDirHarness } from '../../../utils/agents-dir.ts';
import { createTempDir, writeTree } from '../../../utils/folder.ts';
import type { Harness } from '../../../utils/harness.ts';

let root: { path: string; remove: () => Promise<void> };
let harnesses: Harness[] = [];

beforeEach(async () => {
    root = await createTempDir();
});

afterEach(async () => {
    await Promise.all(harnesses.map((h) => h.stop()));
    harnesses = [];
    await root.remove();
});

function build(options: Parameters<typeof buildAgentsDirHarness>[0]) {
    const setup = buildAgentsDirHarness(options);

    harnesses.push(setup.harness);

    return setup;
}

function componentNames(harness: Harness): string[] {
    return harness.container.resolveAll(AppToken.COMPONENTS).map((entry) => entry.name);
}

function watcherOf(harness: Harness) {
    const entry = harness.container.resolveAll(AppToken.COMPONENTS).find((component) => component.name === 'agents-watcher');

    if (!entry) {
        throw new Error('no agents-watcher component');
    }

    return entry.component;
}

/** Replaces the engine's putAgent by one that rejects while `failing()` is true (a store failure). */
function failPutAgent(engine: IEngine, failing: () => boolean): void {
    const putAgent = engine.putAgent.bind(engine);

    Object.assign(engine, {
        putAgent: async (...args: Parameters<IEngine['putAgent']>) => {
            if (failing()) {
                throw new Error('store down');
            }

            return putAgent(...args);
        },
    });
}

/** Counts the polls that reach the marker check (every poll with an applied agent). */
function countPolls(engine: IEngine): () => number {
    let count = 0;
    const find = engine.agentRevisionService.find.bind(engine.agentRevisionService);

    Object.assign(engine.agentRevisionService, {
        find: async (...args: Parameters<typeof find>) => {
            count++;

            return find(...args);
        },
    });

    return () => count;
}

describe('the agents dir watcher as a component', () => {
    it('is contributed as agents-watcher in start mode and started by the components module', async () => {
        await writeTree(root.path, { 'greeter/agent.ts': agentFile('v1') });

        const setup = build({ root: root.path });

        await setup.harness.setup();

        // the store's purge comes first: the store module sets up before the agents module
        expect(setup.harness.container.resolve(AppToken.COMPONENT_LIST).map((entry) => entry.name)).toEqual(['store-purge', 'agents-watcher']);

        const v1 = setup.engine().agentRevision('greeter');

        await writeFile(join(root.path, 'greeter', 'agent.ts'), agentFile('v2'));
        await setup.poll();
        await setup.poll();
        expect(setup.engine().agentRevision('greeter')).not.toBe(v1);
    });

    it.each([
        ['job', { mode: 'job' as const }],
        ['check', { check: true }],
    ])('is not contributed in a %s', async (_, options) => {
        await writeTree(root.path, { 'greeter/agent.ts': agentFile('v1') });

        const setup = build({ root: root.path, ...options });

        await setup.harness.setup();

        expect(componentNames(setup.harness)).not.toContain('agents-watcher');
    });

    it('is not contributed without an agents dir', async () => {
        const setup = build({ cwd: root.path });

        await setup.harness.setup();

        expect(componentNames(setup.harness)).toEqual(['store-purge']);
    });

    it('records a poll whose reload failed as failed after logging it once, and a successful poll as a success', async () => {
        await writeTree(root.path, { 'greeter/agent.ts': agentFile('v1') });

        const setup = build({ root: root.path });

        await setup.harness.setup();

        const watcher = watcherOf(setup.harness);
        let failing = true;

        failPutAgent(setup.engine(), () => failing);
        await writeFile(join(root.path, 'greeter', 'agent.ts'), agentFile('v2'));
        // the first poll sees the new hash, the second (stable) one reloads
        await setup.poll();

        const success = watcher.status().lastSuccessAt;

        expect(success).toBe(setup.clock.now());
        await setup.poll();

        const errors = setup.logger.entries.filter((entry) => entry.level === 'error');

        expect(errors.map((entry) => entry.msg)).toEqual(['agent reload failed']);
        expect(watcher.status().lastErrorAt).toBe(setup.clock.now());
        expect(watcher.status().lastSuccessAt).toBe(success);

        failing = false;
        await setup.poll();
        expect(watcher.status().lastSuccessAt).toBe(setup.clock.now());
        expect(setup.logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(1);
    });

    it('runs one poll, not a burst, when the clock jumps past many intervals', async () => {
        await writeTree(root.path, { 'greeter/agent.ts': agentFile('v1') });

        const setup = build({ root: root.path });

        await setup.harness.setup();

        const polls = countPolls(setup.engine());
        const watcher = watcherOf(setup.harness);

        setup.clock.advance(POLL_MS * 50);
        await watcher.settled?.();
        expect(polls()).toBe(1);

        // the next poll waits one interval from the moment the last one settled
        setup.clock.advance(POLL_MS - 1);
        await watcher.settled?.();
        expect(polls()).toBe(1);
        await setup.poll();
        expect(polls()).toBe(2);
    });
});
