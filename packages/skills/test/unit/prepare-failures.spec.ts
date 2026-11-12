/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { createGitFixture } from '@chamvi/test-kit';
import type { GitFixture } from '@chamvi/test-kit';
import * as skills from '@chamvi/skills';
import {
    SKILL_PREPARATION_FAILED_ERROR_CODE,
    SKILL_PREPARATION_LOCKED_ERROR_CODE,
    SKILL_PREPARATION_LOCK_STALE_MS,
} from '@chamvi/skills';
import * as sdk from 'skills';
import { guardStaleMs } from '../../src/prepare/lock.ts';
import {
    afterEach,
    describe,
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
const originals = new WeakMap<object, sdk.SkillSource>();

const fixtures: GitFixture[] = [];
const roots: string[] = [];

async function setup() {
    const fixture = await createGitFixture({ 'skills/audit/SKILL.md': '---\nname: audit\ndescription: Review code\n---\nBODY\n' });

    fixtures.push(fixture);

    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'chamvi-prepare-failures-')));

    roots.push(root);

    const directory = join(root, 'corpus');

    return {
        root,
        guard: join(root, `.${basename(directory)}.chamvi-skills-lock`),
        options: {
            source: fixture.path,
            revision: fixture.commit,
            names: ['audit'],
            directory,
        },
    };
}

async function failureOf(promise: Promise<unknown>): Promise<Error & { code?: unknown }> {
    return promise.then(() => {
        throw new Error('expected a rejection');
    }, (error: Error & { code?: unknown }) => error);
}

async function writeOwner(guard: string, owner: Record<string, unknown>) {
    await fs.mkdir(guard);
    await fs.writeFile(join(guard, 'owner.json'), JSON.stringify(owner));
}

afterEach(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
    fixtures.length = 0;
    roots.length = 0;
    vi.mocked(sdk.resolveSource).mockReset().mockImplementation(actual.resolveSource);
    // a wrapped handle reaches the real install as the SDK's own handle
    vi.mocked(sdk.installSkills).mockReset().mockImplementation((source, options) => actual.installSkills(
        typeof source === 'string' ? source : originals.get(source) ?? source,
        options,
    ));
});

describe('prepareSkills failures', () => {
    it('refuses a guard a live preparer holds with an error naming the guard path', async () => {
        const { guard, options } = await setup();
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const first = skills.prepareSkills({
            ...options,
            verify: async () => {
                entered.resolve();
                await release.promise;
            },
        });

        await entered.promise;

        try {
            const error = await failureOf(skills.prepareSkills(options));

            expect(error).not.toBeInstanceOf(InvalidAgentDefinitionError);
            expect(error.code).toBe(SKILL_PREPARATION_LOCKED_ERROR_CODE);
            expect(error.message).toContain(guard);
        } finally {
            release.resolve();
        }

        await first;
        await expect(fs.stat(guard)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('recovers a guard whose owner process on this host is gone', async () => {
        const { guard, options } = await setup();

        await writeOwner(guard, {
            host: hostname(),
            pid: 2 ** 22 + 12_345,
            processStart: 0,
            token: 'dead',
            createdAt: Date.now(),
        });

        await expect(skills.prepareSkills(options)).resolves.toHaveLength(1);
        await expect(fs.stat(guard)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('recovers a guard of an earlier incarnation of this process id', async () => {
        const { guard, options } = await setup();

        await writeOwner(guard, {
            host: hostname(),
            pid: process.pid,
            processStart: 1,
            token: 'restarted',
            createdAt: Date.now(),
        });

        await expect(skills.prepareSkills(options)).resolves.toHaveLength(1);
    });

    it('recovers a guard this process left behind but no longer holds', async () => {
        const { guard, options } = await setup();

        await writeOwner(guard, {
            host: hostname(),
            pid: process.pid,
            processStart: Math.round(performance.timeOrigin),
            token: 'leftover',
            createdAt: Date.now(),
        });

        await expect(skills.prepareSkills(options)).resolves.toHaveLength(1);
    });

    it('keeps a guard another copy of this package in the process holds', async () => {
        const { guard, options } = await setup();
        const held = (globalThis as Record<symbol, unknown>)[Symbol.for('chamvi.skills.preparationGuards')] as Set<string>;

        await writeOwner(guard, {
            host: hostname(),
            pid: process.pid,
            processStart: Math.round(performance.timeOrigin),
            token: 'other-copy',
            createdAt: Date.now(),
        });
        held.add(guard);

        try {
            expect((await failureOf(skills.prepareSkills(options))).code).toBe(SKILL_PREPARATION_LOCKED_ERROR_CODE);
        } finally {
            held.delete(guard);
        }
    });

    describe.skipIf(!existsSync('/proc/self/stat'))('with /proc', () => {
        const ticksOf = (pid: number) => {
            const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');

            return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
        };

        it('never reclaims an old guard of a live owner on this host by its age', async () => {
            const { guard, options } = await setup();

            await writeOwner(guard, {
                host: hostname(),
                pid: process.ppid,
                processStart: 0,
                processTicks: ticksOf(process.ppid),
                token: 'live',
                createdAt: Date.now() - (2 * guardStaleMs()),
            });

            expect((await failureOf(skills.prepareSkills(options))).code).toBe(SKILL_PREPARATION_LOCKED_ERROR_CODE);
        });

        it('recovers a guard whose pid another process reused', async () => {
            const { guard, options } = await setup();

            await writeOwner(guard, {
                host: hostname(),
                pid: process.ppid,
                processStart: 0,
                processTicks: '1',
                token: 'reused',
                createdAt: Date.now(),
            });

            await expect(skills.prepareSkills(options)).resolves.toHaveLength(1);
        });
    });

    it('keeps a verifier rejecting with the caller\'s abort reason a cancellation', async () => {
        const { options } = await setup();
        const controller = new AbortController();
        const reason = new Error('stopped');
        const error = await failureOf(skills.prepareSkills({
            ...options,
            signal: controller.signal,
            verify: async () => {
                controller.abort(reason);

                throw reason;
            },
        }));

        expect(error).toBe(reason);
    });

    it('removes a recovery guard a crashed recoverer left once it is a minute old', async () => {
        const { guard, options } = await setup();

        await writeOwner(guard, {
            host: hostname(),
            pid: 2 ** 22 + 12_345,
            token: 'dead',
            createdAt: Date.now(),
        });
        await fs.mkdir(`${guard}.recover`);

        const old = new Date(Date.now() - 61_000);

        await fs.utimes(`${guard}.recover`, old, old);
        expect((await failureOf(skills.prepareSkills(options))).code).toBe(SKILL_PREPARATION_LOCKED_ERROR_CODE);
        await expect(skills.prepareSkills(options)).resolves.toHaveLength(1);
    });

    it('stretches the stale bound to twice a longer SDK clone timeout', () => {
        expect(guardStaleMs({})).toBe(SKILL_PREPARATION_LOCK_STALE_MS);
        expect(guardStaleMs({ SKILLS_CLONE_TIMEOUT_MS: '600000' })).toBe(SKILL_PREPARATION_LOCK_STALE_MS);
        expect(guardStaleMs({ SKILLS_CLONE_TIMEOUT_MS: '3600000' })).toBe(7_200_000);
        expect(guardStaleMs({ SKILLS_CLONE_TIMEOUT_MS: 'x' })).toBe(SKILL_PREPARATION_LOCK_STALE_MS);
    });

    it('keeps a configuration error when the checkout cleanup also fails', async () => {
        const { options } = await setup();

        vi.mocked(sdk.resolveSource).mockImplementationOnce(async (...args) => {
            const handle = await actual.resolveSource(...args);
            const wrapped = {
                source: handle.source,
                skills: handle.skills,
                dispose: async () => {
                    await handle.dispose();

                    throw new Error('busy');
                },
            };

            originals.set(wrapped, handle);

            return wrapped;
        });
        await expect(skills.prepareSkills({
            ...options,
            verify: () => {
                throw new Error('refused');
            },
        })).rejects.toThrow(InvalidAgentDefinitionError);
    });

    it('keeps a fresh guard of another host and recovers it once older than the bound', async () => {
        const { guard, options } = await setup();
        const owner = {
            host: `${hostname()}-other`,
            pid: 1,
            processStart: 0,
            token: 'remote',
        };

        await writeOwner(guard, { ...owner, createdAt: Date.now() });
        expect((await failureOf(skills.prepareSkills(options))).code).toBe(SKILL_PREPARATION_LOCKED_ERROR_CODE);
        expect(JSON.parse(await fs.readFile(join(guard, 'owner.json'), 'utf8')).token).toBe('remote');

        await fs.writeFile(join(guard, 'owner.json'), JSON.stringify({ ...owner, createdAt: Date.now() - SKILL_PREPARATION_LOCK_STALE_MS - 1 }));
        await expect(skills.prepareSkills(options)).resolves.toHaveLength(1);
    });

    it('recovers a guard without an owner record by its age only', async () => {
        const { guard, options } = await setup();

        await fs.mkdir(guard);
        expect((await failureOf(skills.prepareSkills(options))).code).toBe(SKILL_PREPARATION_LOCKED_ERROR_CODE);

        const old = new Date(Date.now() - SKILL_PREPARATION_LOCK_STALE_MS - 1_000);

        await fs.utimes(guard, old, old);
        await expect(skills.prepareSkills(options)).resolves.toHaveLength(1);
    });

    it('reports a failed checkout cleanup after a success as retryable', async () => {
        const { options } = await setup();

        vi.mocked(sdk.resolveSource).mockImplementationOnce(async (...args) => {
            const handle = await actual.resolveSource(...args);
            const wrapped = {
                source: handle.source,
                skills: handle.skills,
                dispose: async () => {
                    await handle.dispose();

                    throw new Error('busy');
                },
            };

            originals.set(wrapped, handle);

            return wrapped;
        });
        expect((await failureOf(skills.prepareSkills(options))).code).toBe(SKILL_PREPARATION_FAILED_ERROR_CODE);
    });

    it('reports a failed fetch of the pinned commit through the real SDK clone as retryable', async () => {
        const { root, options } = await setup();

        // the SDK's `clone --branch <sha>` fails with "Remote branch <sha> not found", then its own
        // fetch of the sha fails (here on a bad client setting, as a network failure would) and is swallowed
        vi.stubEnv('GIT_CONFIG_COUNT', '1');
        vi.stubEnv('GIT_CONFIG_KEY_0', 'fetch.negotiationAlgorithm');
        vi.stubEnv('GIT_CONFIG_VALUE_0', 'bogus');

        try {
            const error = await failureOf(skills.prepareSkills(options));

            expect(error).not.toBeInstanceOf(InvalidAgentDefinitionError);
            expect(error.code).toBe(SKILL_PREPARATION_FAILED_ERROR_CODE);
        } finally {
            vi.unstubAllEnvs();
        }

        expect(await fs.readdir(root)).toEqual([]);
    });

    it('reports a pinned commit the source does not hold as retryable, since the SDK hides the cause', async () => {
        const { options } = await setup();
        const error = await failureOf(skills.prepareSkills({ ...options, revision: 'f'.repeat(40) }));

        expect(error).not.toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.code).toBe(SKILL_PREPARATION_FAILED_ERROR_CODE);
    });

    it('reports a repository the real SDK clone does not find as configuration', async () => {
        const { root, options } = await setup();
        const error = await failureOf(skills.prepareSkills({ ...options, source: 'file:///missing/token-secret.git' }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).not.toContain('token-secret');
        expect(await fs.readdir(root)).toEqual([]);
    });

    const url = 'https://user:token-secret@example.com/x.git';
    const detail = `fatal: unable to access '${url}/': token-secret`;

    it.each([
        ['SKILLS_GIT_AUTH_FAILED', () => sdk.diagnostics.SKILLS_GIT_AUTH_FAILED({ url, host: 'example.com' })],
        ['SKILLS_GIT_SAML_SSO_BLOCKED', () => sdk.diagnostics.SKILLS_GIT_SAML_SSO_BLOCKED({
            url, 
            sshUrl: url, 
            host: 'example.com', 
        })],
        ['SKILLS_UNSUPPORTED_GIT_TRANSPORT', () => sdk.diagnostics.SKILLS_UNSUPPORTED_GIT_TRANSPORT({ transport: url })],
        ['SKILLS_INVALID_OPTION_VALUE', () => sdk.diagnostics.SKILLS_INVALID_OPTION_VALUE({ option: 'ref', expected: url })],
        ['SKILLS_LOCAL_PATH_NOT_FOUND', () => sdk.diagnostics.SKILLS_LOCAL_PATH_NOT_FOUND({ path: url })],
        ['SKILLS_NO_VALID_SKILLS', () => sdk.diagnostics.SKILLS_NO_VALID_SKILLS()],
        ['SKILLS_NO_MATCHING_SKILLS', () => sdk.diagnostics.SKILLS_NO_MATCHING_SKILLS({ requested: [url], available: [url] })],
        ['SKILLS_AMBIGUOUS_SKILL_SELECTOR', () => sdk.diagnostics.SKILLS_AMBIGUOUS_SKILL_SELECTOR({ selector: url })],
        ['SKILLS_DUPLICATE_SKILL_NAME', () => sdk.diagnostics.SKILLS_DUPLICATE_SKILL_NAME({ skills: [url] })],
        ['SKILLS_SKILL_CONTAINS_SYMLINKS', () => sdk.diagnostics.SKILLS_SKILL_CONTAINS_SYMLINKS({ links: [url] })],
        ['SKILLS_UNSAFE_SUBPATH', () => sdk.diagnostics.SKILLS_UNSAFE_SUBPATH({ subpath: url })],
        ['SKILLS_SUBPATH_OUTSIDE_REPO', () => sdk.diagnostics.SKILLS_SUBPATH_OUTSIDE_REPO({ subpath: url })],
        ['SKILLS_GIT_CLONE_FAILED for a repository git does not find', () => sdk.diagnostics.SKILLS_GIT_CLONE_FAILED({
            url,
            detail: 'not found',
            cause: new Error(`fatal: '${url}' does not appear to be a git repository`),
        })],
    ])('reports %s as configuration with the generic message', async (_, diagnostic) => {
        const { root, options } = await setup();

        vi.mocked(sdk.resolveSource).mockRejectedValueOnce(diagnostic());

        const error = await failureOf(skills.prepareSkills(options));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).not.toContain('token-secret');
        expect(error.message).not.toContain('example.com');
        expect(await fs.readdir(root)).toEqual([]);
    });

    it.each([
        ['SKILLS_GIT_CLONE_TIMEOUT', () => sdk.diagnostics.SKILLS_GIT_CLONE_TIMEOUT({ seconds: 300 })],
        ['SKILLS_GIT_CLONE_FAILED', () => sdk.diagnostics.SKILLS_GIT_CLONE_FAILED({
            url, 
            detail, 
            cause: new Error(detail), 
        })],
        ['SKILLS_GIT_CLONE_FAILED for a missing ref', () => {
            const answer = `fatal: Remote branch ${'a'.repeat(40)} not found in upstream origin`;

            return sdk.diagnostics.SKILLS_GIT_CLONE_FAILED({
                url, 
                detail: answer, 
                cause: new Error(answer), 
            });
        }],
        ['SKILLS_GIT_CLONE_FAILED whose message alone names a missing repository', () => sdk.diagnostics.SKILLS_GIT_CLONE_FAILED({
            url: 'https://example.com/does not appear to be a git repository',
            detail,
            cause: new Error(detail),
        })],
        ['SKILLS_SOURCE_FETCH_FAILED', () => sdk.diagnostics.SKILLS_SOURCE_FETCH_FAILED({ source: url, detail })],
        ['an unknown code', () => sdk.diagnostics.SKILLS_LOCK_WRITE_FAILED({ detail })],
        ['a non-diagnostic', () => new Error(detail)],
    ])('reports %s as retryable with the generic message', async (_, failure) => {
        const { root, options } = await setup();

        vi.mocked(sdk.resolveSource).mockRejectedValueOnce(failure());

        const error = await failureOf(skills.prepareSkills(options));

        expect(error).not.toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.code).toBe(SKILL_PREPARATION_FAILED_ERROR_CODE);
        expect(error.message).not.toContain('token-secret');
        expect(error.message).not.toContain('example.com');
        expect(await fs.readdir(root)).toEqual([]);
    });

    it('maps a diagnostic thrown by the install like one of the resolve', async () => {
        const { root, options } = await setup();

        vi.mocked(sdk.installSkills).mockRejectedValueOnce(sdk.diagnostics.SKILLS_SKILL_CONTAINS_SYMLINKS({ links: [url] }));
        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(await fs.readdir(root)).toEqual([]);
    });

    it('reports a failed fetch of the pinned tree as retryable without forwarding the URL', async () => {
        const { root, options } = await setup();

        vi.mocked(sdk.resolveSource).mockImplementationOnce(async (...args) => {
            const handle = await actual.resolveSource(...args);
            const wrapped = {
                source: { ...handle.source, url: 'file:///missing/token-secret.git' },
                skills: handle.skills,
                dispose: () => handle.dispose(),
            };

            originals.set(wrapped, handle);

            return wrapped;
        });

        const error = await failureOf(skills.prepareSkills(options));

        expect(error.code).toBe(SKILL_PREPARATION_FAILED_ERROR_CODE);
        expect(error.message).not.toContain('token-secret');
        expect(sdk.installSkills).not.toHaveBeenCalled();
        expect(await fs.readdir(root)).toEqual([]);
    });
});
