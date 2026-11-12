/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import fs from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SKILL_PREPARATION_FAILED_ERROR_CODE, prepareSkills } from '@chamvi/skills';
import { createGitFixture } from '@chamvi/test-kit';
import type { GitFixture } from '@chamvi/test-kit';
import * as sdk from 'skills';
import {
    afterEach,
    expect,
    it,
    vi,
} from 'vitest';

vi.mock('skills', async (original) => {
    const actual = await original<typeof sdk>();

    return {
        ...actual,
        resolveSource: vi.fn(actual.resolveSource),
        installSkills: vi.fn(actual.installSkills),
    };
});

const actual = await vi.importActual<typeof sdk>('skills');

const roots: string[] = [];
const fixtures: GitFixture[] = [];
async function setup() {
    const fixture = await createGitFixture({ 'skills/audit/SKILL.md': '---\nname: audit\ndescription: Review\n---\nBODY\n' });

    fixtures.push(fixture);

    const root = await fs.mkdtemp(join(tmpdir(), 'chamvi-cancel-'));

    roots.push(root);

    const options = {
        source: fixture.path,
        revision: fixture.commit,
        names: ['audit'],
        directory: join(root, 'corpus'),
    };

    await prepareSkills(options);

    return { root, options };
}
afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(sdk.resolveSource).mockReset().mockImplementation(actual.resolveSource);
    vi.mocked(sdk.installSkills).mockReset().mockImplementation(actual.installSkills);
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
    fixtures.length = 0;
    roots.length = 0;
});
it('observes cancellation after staged verification and preserves the old corpus', async () => {
    const { root, options } = await setup();
    const controller = new AbortController();
    const reason = new Error('cancel before promotion');
    const rename = vi.spyOn(fs, 'rename');

    await expect(prepareSkills({
        ...options,
        signal: controller.signal,
        verify: () => {
            controller.abort(reason);
        },
    })).rejects.toBe(reason);
    expect(rename).not.toHaveBeenCalled();
    expect(await fs.readFile(join(options.directory, 'audit/SKILL.md'), 'utf8')).toContain('BODY');
    expect(await fs.readdir(root)).toEqual(['corpus']);
});
it.each(['promotion', 'rollback'] as const)('finishes %s and cleanup before observing cancellation in the critical section', async (phase) => {
    const { root, options } = await setup();
    const controller = new AbortController();
    const reason = new Error('cancel during promotion');
    const rename = fs.rename.bind(fs);

    vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
        if (String(destination).endsWith('/previous')) {
            await rename(source, destination);
            controller.abort(reason);

            return;
        }

        if (phase === 'rollback' && String(source).endsWith('/.agents/skills')) {
            throw new Error('promotion failed');
        }

        await rename(source, destination);
    });

    if (phase === 'rollback') {
        await expect(prepareSkills({ ...options, signal: controller.signal })).rejects.toMatchObject({ code: SKILL_PREPARATION_FAILED_ERROR_CODE });
    } else {
        await expect(prepareSkills({ ...options, signal: controller.signal })).rejects.toBe(reason);
    }

    expect(await fs.readFile(join(options.directory, 'audit/SKILL.md'), 'utf8')).toContain('BODY');
    expect(await fs.readdir(root)).toEqual(['corpus']);
});

it('preserves an independent verifier failure when the caller also cancels', async () => {
    const { root, options } = await setup();
    const controller = new AbortController();

    await expect(prepareSkills({
        ...options,
        signal: controller.signal,
        verify: () => {
            controller.abort(new Error('caller canceled'));

            throw new Error('PRIVATE verifier failure');
        },
    })).rejects.toMatchObject({ name: 'InvalidAgentDefinitionError' });
    expect(await fs.readdir(root)).toEqual(['corpus']);
});

it('preserves cleanup failure when the caller cancels during cleanup', async () => {
    const { options } = await setup();
    const controller = new AbortController();

    vi.spyOn(fs, 'rmdir').mockImplementationOnce(async () => {
        controller.abort(new Error('caller canceled'));

        throw new Error('PRIVATE cleanup failure');
    });
    await expect(prepareSkills({ ...options, signal: controller.signal })).rejects.toMatchObject({ code: SKILL_PREPARATION_FAILED_ERROR_CODE });
});

it('waits for a running SDK resolve, disposes its checkout and rejects with the abort reason', async () => {
    const { root, options } = await setup();
    const guard = join(root, '.corpus.chamvi-skills-lock');
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const dispose = vi.fn<() => Promise<void>>();
    let checkout: sdk.SkillSource | undefined;

    vi.mocked(sdk.installSkills).mockClear();
    vi.mocked(sdk.resolveSource).mockImplementationOnce(async (...args) => {
        const handle = await actual.resolveSource(...args);

        checkout = handle;
        dispose.mockImplementation(() => handle.dispose());
        entered.resolve();
        // the SDK does not interrupt a running clone
        await release.promise;

        return {
            source: handle.source,
            skills: handle.skills,
            dispose,
        };
    });

    const controller = new AbortController();
    const reason = new Error('cancel during clone');
    let settled = false;
    const pending = prepareSkills({ ...options, signal: controller.signal }).finally(() => {
        settled = true;
    });
    const rejected = expect(pending).rejects.toBe(reason);

    await entered.promise;
    controller.abort(reason);
    await new Promise((done) => {
        setTimeout(done, 20);
    });
    expect(settled).toBe(false);
    expect(dispose).not.toHaveBeenCalled();
    release.resolve();
    await rejected;
    expect(checkout).toBeDefined();
    expect(dispose).toHaveBeenCalled();
    expect(sdk.installSkills).not.toHaveBeenCalled();
    await expect(fs.stat(guard)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(join(options.directory, 'audit/SKILL.md'), 'utf8')).toContain('BODY');
    expect(await fs.readdir(root)).toEqual(['corpus']);
});

it('forwards the abort reason the SDK rejects with as the cancellation', async () => {
    const { root, options } = await setup();
    const controller = new AbortController();
    const reason = new Error('cancel inside the SDK');

    vi.mocked(sdk.resolveSource).mockImplementationOnce(async () => {
        controller.abort(reason);

        throw reason;
    });
    await expect(prepareSkills({ ...options, signal: controller.signal })).rejects.toBe(reason);
    expect(await fs.readdir(root)).toEqual(['corpus']);
});

it.each(['a mocked diagnostic', 'the real SDK on a missing repository'] as const)('rejects with the abort reason when the SDK fails after an abort: %s', async (kind) => {
    const { root, options } = await setup();
    const controller = new AbortController();
    const reason = new Error('cancel during a failing clone');

    vi.mocked(sdk.resolveSource).mockImplementationOnce(async (source, resolveOptions) => {
        if (kind === 'a mocked diagnostic') {
            await new Promise((done) => {
                setTimeout(done, 5);
            });
            controller.abort(reason);

            throw sdk.diagnostics.SKILLS_GIT_AUTH_FAILED({ url: String(source), host: 'example.com' });
        }

        const pending = actual.resolveSource('file:///missing/cancelled.git', resolveOptions);

        controller.abort(reason);

        return pending;
    });
    await expect(prepareSkills({ ...options, signal: controller.signal })).rejects.toBe(reason);
    expect(await fs.readdir(root)).toEqual(['corpus']);
});

it('aborts the fetch of the pinned tree, rejects with the abort reason and removes the fetched repository', async () => {
    const { root, options } = await setup();
    const sockets = new Set<Socket>();
    const accepted = Promise.withResolvers<void>();
    // a host that accepts the fetch and never answers
    const server = createServer((socket) => {
        sockets.add(socket);
        accepted.resolve();
    });

    await new Promise<void>((done) => {
        server.listen(0, '127.0.0.1', done);
    });

    const { port } = server.address() as AddressInfo;
    const dispose = vi.fn<() => Promise<void>>();

    vi.mocked(sdk.installSkills).mockClear();
    vi.mocked(sdk.resolveSource).mockImplementationOnce(async (...args) => {
        const handle = await actual.resolveSource(...args);

        dispose.mockImplementation(() => handle.dispose());

        return {
            source: { ...handle.source, url: `http://127.0.0.1:${port}/repo.git` },
            skills: handle.skills,
            dispose,
        };
    });

    const controller = new AbortController();
    const reason = new Error('cancel during the tree fetch');

    try {
        const pending = prepareSkills({ ...options, signal: controller.signal });
        const rejected = expect(pending).rejects.toBe(reason);

        await accepted.promise;
        controller.abort(reason);
        await rejected;
    } finally {
        for (const socket of sockets) {
            socket.destroy();
        }

        await new Promise((done) => {
            server.close(done);
        });
    }

    expect(dispose).toHaveBeenCalled();
    expect(sdk.installSkills).not.toHaveBeenCalled();
    expect(await fs.readdir(root)).toEqual(['corpus']);
});
