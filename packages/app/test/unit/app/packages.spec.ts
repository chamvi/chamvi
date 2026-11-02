/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { join } from 'node:path';
import { createMemoryStore } from '@chamvi/core';
import type { IStore } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    agentsModule,
    configModule,
    createApp,
    storeModule,
} from '@chamvi/app';
import type { IApp } from '@chamvi/app';
import { cronTrigger, provider } from '../../utils/agents-dir.ts';
import { TOKENS, rejectionOf } from '../../utils/app.ts';
import { createTempDir, writeTree } from '../../utils/folder.ts';
import { createRecordingLogger } from '../../utils/logger.ts';
import { freePort } from '../../utils/port.ts';
import { installPackage } from '../../utils/packages.ts';

const START = new Date('2026-11-02T00:00:00Z');
const CRON = `, channels: [${cronTrigger('0 9 * * *')}]`;

let apps: IApp[] = [];
let tmp: Awaited<ReturnType<typeof createTempDir>>;
let cwd: string;

beforeEach(async () => {
    tmp = await createTempDir();
    cwd = join(tmp.path, 'app');
    await writeTree(cwd, { 'package.json': '{ "name": "app", "private": true }\n' });
});

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    apps = [];
    await tmp.remove();
});

/** Every call on the store that may write (not named find* or read*). */
function recordWrites(store: IStore): { store: IStore; writes: string[] } {
    const writes: string[] = [];
    const wrapped = Object.fromEntries(Object.entries(store).map(([role, repository]) => [role, new Proxy(repository as object, {
        get(target, key, receiver) {
            const value: unknown = Reflect.get(target, key, receiver);

            if (typeof value !== 'function' || typeof key !== 'string') {
                return value;
            }

            return (...args: unknown[]) => {
                if (!/^(find|read)/.test(key)) {
                    writes.push(`${role}.${key}`);
                }

                return (value as (...a: unknown[]) => unknown).apply(target, args);
            };
        },
    })]));

    return { store: wrapped as unknown as IStore, writes };
}

function build(agents: string[], store?: IStore) {
    const clock = new ControllableClock(START);
    const logger = createRecordingLogger(clock);
    const app = createApp({
        agents,
        models: { test: provider() },
        modules: [
            configModule({ clock, logger }),
            storeModule({ store: store ?? createMemoryStore({ clock }) }),
            agentsModule({ cwd }),
        ],
    });

    apps.push(app);

    return app;
}

async function env() {
    return {
        HOST: '127.0.0.1',
        PORT: String(await freePort()),
        CHAMVI_TOKENS: TOKENS,
        CHAMVI_DRAIN_TIMEOUT_MS: '1000',
    };
}

describe('runJob of package agents', () => {
    it('runs a package agent beside a package that does not resolve', async () => {
        await installPackage(cwd, 'ok', { agents: ['greeter'], extra: CRON });

        const result = await build(['@s/missing', 'ok']).runJob({ agent: 'greeter', env: await env() });

        expect(result).toMatchObject({ status: 'completed', exitCode: 0 });
    });

    it('fails with package_agent_failed when the job\'s package agent does not pass its check', async () => {
        await installPackage(cwd, 'broken', {
            agents: ['greeter'],
            extra: ', channels: [{ channel: \'nope\', id: \'nope\', options: {} }]',
        });

        const error = await rejectionOf(build(['broken']).runJob({ agent: 'greeter', env: await env() }));

        expect(error.code).toBe('package_agent_failed');
        expect(error.message).toMatch(/^greeter \(broken\): /);
    });

    it('fails with package_agent_failed naming a package that did not resolve when no agent has the name', async () => {
        await installPackage(cwd, 'ok', { agents: ['other'], extra: CRON });

        const error = await rejectionOf(build(['ok', '@s/missing']).runJob({ agent: 'greeter', env: await env() }));

        expect(error.code).toBe('package_agent_failed');
        expect(error.message).toBe('No agent "greeter" loaded; the package(s) @s/missing did not load and may provide it.');
    });
});

describe('check of package agents', () => {
    it('resolves, imports and checks every package without a store write', async () => {
        await installPackage(cwd, 'ok', { agents: ['greeter'], extra: CRON });
        await installPackage(cwd, 'broken', {
            agents: ['keeper'],
            extra: ', channels: [{ channel: \'nope\', id: \'nope\', options: {} }]',
        });

        const { store, writes } = recordWrites(createMemoryStore());
        const result = await build(['ok', 'broken', '@s/missing'], store).check({ env: await env() });

        expect(result.issues.map((issue) => issue.agent)).toEqual(['keeper', '@s/missing']);
        expect(result.issues[0]!.message).toMatch(/^keeper \(broken\): .*nope/);
        expect(writes).toEqual([]);
    });
});
