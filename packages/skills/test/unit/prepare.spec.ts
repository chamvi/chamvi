/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { createGitFixture } from '@chamvi/test-kit';
import type { GitFixture } from '@chamvi/test-kit';
import * as skills from '@chamvi/skills';
import * as sdk from 'skills';
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

const fixtures: GitFixture[] = [];
const roots: string[] = [];
const document = (name: string, body = 'PRIVATE BODY') => `---\nname: ${name}\ndescription: Review code\n---\n${body}\n`;

async function setup(files: Record<string, string> = {}) {
    const fixture = await createGitFixture({
        'skills/audit/SKILL.md': document('audit'),
        'skills/audit/references/checks.md': 'PRIVATE REFERENCE\r\n',
        'skills/audit/assets/example.json': '{"ok":true}\n',
        'skills/design/SKILL.md': document('design'),
        ...files,
    });

    fixtures.push(fixture);

    const root = await fs.mkdtemp(join(tmpdir(), 'chamvi-prepare-test-'));

    roots.push(root);

    return {
        fixture,
        root,
        options: {
            source: fixture.path,
            revision: fixture.commit,
            names: ['audit'],
            directory: join(root, 'corpus'),
        },
    };
}

afterEach(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
    fixtures.length = 0;
    roots.length = 0;
    vi.restoreAllMocks();
    vi.mocked(sdk.resolveSource).mockReset().mockImplementation(actual.resolveSource);
    vi.mocked(sdk.installSkills).mockReset().mockImplementation(actual.installSkills);
});

/** Resolves the real source, then replaces fields of its answer; the original handle is disposed through the copy. */
function patchHandle(patch: (handle: sdk.SkillSource) => Partial<sdk.SkillSource>) {
    const dispose = vi.fn<() => Promise<void>>();

    vi.mocked(sdk.resolveSource).mockImplementationOnce(async (...args) => {
        const handle = await actual.resolveSource(...args);

        dispose.mockImplementation(() => handle.dispose());

        return {
            source: handle.source,
            skills: handle.skills,
            dispose,
            ...patch(handle),
        };
    });

    return dispose;
}

describe('prepareSkills', () => {
    it('copies the requested commit in requested order with references and assets, without changing cwd', async () => {
        const { fixture, options } = await setup();

        await fs.writeFile(join(fixture.path, 'skills/audit/SKILL.md'), document('audit', 'UNCOMMITTED BODY'));

        const cwd = process.cwd();
        const result = await skills.prepareSkills({ ...options, names: ['design', 'audit'] });

        expect(result.map((skill) => skill.name)).toEqual(['design', 'audit']);
        expect(result[1]).toEqual({
            name: 'audit',
            description: 'Review code',
            path: join(options.directory, 'audit'),
        });
        expect(await fs.readFile(join(result[1]!.path, 'SKILL.md'), 'utf8')).toContain('PRIVATE BODY');
        expect(await fs.readFile(join(result[1]!.path, 'references/checks.md'), 'utf8')).toBe('PRIVATE REFERENCE\r\n');
        expect(await fs.readFile(join(result[1]!.path, 'assets/example.json'), 'utf8')).toBe('{"ok":true}\n');
        expect(process.cwd()).toBe(cwd);
        expect((await fs.lstat(result[1]!.path)).isSymbolicLink()).toBe(false);
    });

    it('copies the pinned bytes when the source HEAD moved past the pin', async () => {
        const { fixture, options } = await setup();

        await fs.writeFile(join(fixture.path, 'skills/audit/SKILL.md'), document('audit', 'HEAD BODY'));
        await fixture.git('commit', '-am', 'move head');

        const [skill] = await skills.prepareSkills(options);

        expect(await fs.readFile(join(skill!.path, 'SKILL.md'), 'utf8')).toContain('PRIVATE BODY');
    });

    it('refuses a checkout whose commit is not the pin, disposing it and promoting nothing', async () => {
        const { root, options } = await setup();
        const dispose = patchHandle((handle) => ({ source: { ...handle.source, commit: 'b'.repeat(40) } }));

        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(dispose).toHaveBeenCalled();
        expect(sdk.installSkills).not.toHaveBeenCalled();
        expect(await fs.readdir(root)).toEqual([]);
    });

    it('refuses a checkout without a commit', async () => {
        const { root, options } = await setup();
        const dispose = patchHandle((handle) => ({ source: { ...handle.source, commit: undefined } }));

        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(dispose).toHaveBeenCalled();
        expect(await fs.readdir(root)).toEqual([]);
    });

    it('refuses a source the SDK does not resolve as git', async () => {
        const { root, options } = await setup();

        patchHandle((handle) => ({ source: { ...handle.source, type: 'local' } }));
        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(await fs.readdir(root)).toEqual([]);
    });

    it('passes the pin, discovery options and the signal to the SDK, with no warning handler and no telemetry or lockfile', async () => {
        const { fixture, options } = await setup();
        const { signal } = new AbortController();

        await skills.prepareSkills({
            ...options, 
            names: ['design', 'audit'], 
            signal, 
        });

        expect(sdk.resolveSource).toHaveBeenCalledTimes(1);

        const [source, resolveOptions] = vi.mocked(sdk.resolveSource).mock.calls[0]!;

        expect(source).toBe(pathToFileURL(fixture.path).href);
        expect(resolveOptions).toEqual({
            ref: fixture.commit,
            fullDepth: true,
            includeInternal: true,
            signal,
        });
        expect(vi.mocked(sdk.installSkills).mock.calls.map(([, install]) => install)).toEqual(['design', 'audit'].map((name) => ({
            cwd: expect.any(String),
            skills: [name],
            agents: ['universal'],
            mode: 'copy',
            lockfile: false,
            telemetry: false,
            duplicates: 'error',
            symlinks: 'reject',
            signal,
        })));
    });

    it('hands an absolute local path to the SDK as a file URL', async () => {
        const { fixture, options } = await setup();

        await expect(skills.prepareSkills(options)).resolves.toHaveLength(1);
        expect(vi.mocked(sdk.resolveSource).mock.calls[0]![0]).toBe(pathToFileURL(fixture.path).href);
    });

    it('hands a ../ relative local path to the SDK as a file URL', async () => {
        const { fixture, options } = await setup();
        const source = relative(process.cwd(), fixture.path);

        expect(source.startsWith('../')).toBe(true);
        await expect(skills.prepareSkills({ ...options, source })).resolves.toHaveLength(1);
        expect(vi.mocked(sdk.resolveSource).mock.calls[0]![0]).toBe(pathToFileURL(fixture.path).href);
    });

    it('hands a ./ relative local path to the SDK as a file URL', async () => {
        const { options } = await setup();

        await expect(skills.prepareSkills({ ...options, source: './missing-skills-source' })).rejects.toThrow(InvalidAgentDefinitionError);
        expect(vi.mocked(sdk.resolveSource).mock.calls[0]).toEqual([
            pathToFileURL(resolve('missing-skills-source')).href,
            expect.objectContaining({ ref: options.revision }),
        ]);
    });

    it('hands an scp-style git source to the SDK unchanged', async () => {
        const { options } = await setup();

        vi.mocked(sdk.resolveSource).mockRejectedValueOnce(sdk.diagnostics.SKILLS_GIT_AUTH_FAILED({ url: 'git@github.com:owner/repo.git', host: 'github.com' }));
        await expect(skills.prepareSkills({ ...options, source: 'git@github.com:owner/repo.git' })).rejects.toThrow(InvalidAgentDefinitionError);
        expect(vi.mocked(sdk.resolveSource).mock.calls[0]).toEqual([
            'git@github.com:owner/repo.git',
            expect.objectContaining({ ref: options.revision }),
        ]);
    });

    it.each([
        'owner/repo#main',
        'https://github.com/owner/repo.git#main',
        'owner/repo@audit',
        'github:owner/repo@audit',
        'owner/repo@v1.2.3',
        'ext::sh -c x',
        'fd::3',
        'https://github.com/owner/repo/tree/main',
        'https://gitlab.com/group/repo/-/tree/main/skills',
    ])('refuses the source %s before any SDK call', async (source) => {
        const { root, options } = await setup();

        await expect(skills.prepareSkills({ ...options, source })).rejects.toThrow(InvalidAgentDefinitionError);
        expect(sdk.resolveSource).not.toHaveBeenCalled();
        expect(await fs.readdir(root)).toEqual([]);
    });

    it('refuses a selected name declared by two folders and a name upstream would only match fuzzily', async () => {
        const {
            fixture, 
            root, 
            options, 
        } = await setup({
            'skills/other/SKILL.md': document('audit'),
            'skills/fuzzy/SKILL.md': document('Foo Bar'),
        });

        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(skills.prepareSkills({ ...options, names: ['foo-bar'] })).rejects.toThrow(InvalidAgentDefinitionError);
        expect(fixture.commit).toMatch(/^[a-f0-9]{40}$/u);
        expect(await fs.readdir(root)).toEqual([]);
    });

    it('installs the exact name when another skill would match it only fuzzily', async () => {
        const { options } = await setup({
            'skills/foo-bar/SKILL.md': document('foo-bar', 'EXACT BODY'),
            'skills/fuzzy/SKILL.md': document('Foo Bar', 'FUZZY BODY'),
        });
        const [skill] = await skills.prepareSkills({ ...options, names: ['foo-bar'] });

        expect(await fs.readFile(join(skill!.path, 'SKILL.md'), 'utf8')).toContain('EXACT BODY');
        expect(await fs.readdir(options.directory)).toEqual(['.chamvi-skills', 'foo-bar']);
    });

    it('refuses a name another skill declares in another case', async () => {
        const { root, options } = await setup({ 'skills/upper/SKILL.md': document('Audit') });

        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(await fs.readdir(root)).toEqual([]);
    });

    it.each([
        ['a failed entry', (result: sdk.InstallResult) => ({
            ...result,
            failed: [{
                skill: 'audit',
                agent: 'universal',
                code: 'SKILLS_INSTALL_FAILED' as const,
                message: 'failed',
            }],
        })],
        ['a skipped entry', (result: sdk.InstallResult) => ({
            ...result,
            skipped: [{
                skill: 'audit',
                agent: 'universal',
                reason: 'missing-agent-directory' as const,
            }],
        })],
        ['no installed entry', (result: sdk.InstallResult) => ({ ...result, installed: [] })],
        ['two installed entries', (result: sdk.InstallResult) => ({ ...result, installed: [...result.installed, ...result.installed] })],
        ['an unexpected path', (result: sdk.InstallResult) => ({ ...result, installed: result.installed.map((entry) => ({ ...entry, path: join(entry.path, '..', 'design') })) })],
    ])('refuses an install result with %s and removes the stage', async (_, patch) => {
        const { root, options } = await setup();

        await skills.prepareSkills(options);
        vi.mocked(sdk.installSkills).mockImplementationOnce(async (...args) => patch(await actual.installSkills(...args)));
        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(await fs.readdir(root)).toEqual(['corpus']);
    });

    it('rejects a SHA-shaped branch pointing at another commit', async () => {
        const { fixture, options } = await setup();

        await fixture.git('commit', '--allow-empty', '-m', 'second');
        await fixture.git('branch', fixture.commit);
        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
    });

    it.each(['missing', 'duplicate', 'verifier'] as const)('preserves the previous corpus when %s fails', async (failure) => {
        const {
            fixture,
            root,
            options,
        } = await setup();

        await skills.prepareSkills(options);

        if (failure === 'duplicate') {
            await fs.mkdir(join(fixture.path, 'skills/other'), { recursive: true });
            await fs.writeFile(join(fixture.path, 'skills/other/SKILL.md'), document('audit'));
            await fixture.git('add', '.');
            await fixture.git('commit', '-m', 'duplicate');
        }

        const revision = (await fixture.git('rev-parse', 'HEAD')).trim();

        await expect(skills.prepareSkills({
            ...options,
            revision,
            names: failure === 'missing' ? ['absent'] : ['audit'],
            verify: failure === 'verifier' ? () => {
                throw new Error('secret source body');
            } : undefined,
        })).rejects.toThrow(InvalidAgentDefinitionError);
        expect(await fs.readFile(join(options.directory, 'audit/SKILL.md'), 'utf8')).toContain('PRIVATE BODY');
        expect(await fs.readdir(root)).toEqual(['corpus']);
    });

    it('verifies every staged skill before replacing a managed corpus, and snapshots options', async () => {
        const { root, options } = await setup();

        await skills.prepareSkills(options);

        const seen: string[] = [];
        const names = ['design', 'audit'];
        const pending = skills.prepareSkills({
            ...options,
            names,
            verify: async (skill) => {
                seen.push(skill.path);
                expect(skill.path.startsWith(options.directory)).toBe(false);
                expect(await fs.readdir(options.directory)).toContain('audit');
                expect(await fs.readFile(join(skill.path, 'SKILL.md'), 'utf8')).toContain(skill.name);
            },
        });

        names.splice(0, 2, 'absent');

        const prepared = await pending;

        expect(prepared.map((skill) => skill.name)).toEqual(['design', 'audit']);
        expect(seen).toHaveLength(2);
        expect(await fs.readdir(root)).toEqual(['corpus']);
        await skills.prepareSkills(options);
        await expect(fs.stat(join(options.directory, 'design'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('refuses concurrent preparation of the same target until staged verification finishes', async () => {
        const { options } = await setup();
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const first = skills.prepareSkills({
            ...options,
            verify: async () => {
                entered.resolve(); await release.promise;
            },
        });

        await entered.promise;

        try {
            await expect(skills.prepareSkills(options)).rejects.toMatchObject({ code: skills.SKILL_PREPARATION_LOCKED_ERROR_CODE });
        } finally {
            release.resolve();
        }

        await first;
        await skills.prepareSkills(options);
    });

    it.each(['nonempty', 'symlink'] as const)('refuses an unowned %s target', async (kind) => {
        const { root, options } = await setup();
        const outside = join(root, 'outside');

        await fs.mkdir(outside);
        await fs.writeFile(join(outside, 'keep.txt'), 'KEEP');

        if (kind === 'symlink') {
            await fs.symlink(outside, options.directory);
        } else {
            await fs.mkdir(options.directory);
            await fs.writeFile(join(options.directory, 'keep.txt'), 'KEEP');
        }

        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(await fs.readFile(join(kind === 'symlink' ? outside : options.directory, 'keep.txt'), 'utf8')).toBe('KEEP');
    });

    it.each([
        { source: '' },
        { source: 'ext::sh -c echo-secret' },
        { revision: 'main' },
        { revision: 'a'.repeat(39) },
        { names: [] },
        { names: ['Audit'] },
        { names: ['../audit'] },
        { names: ['a'.repeat(65)] },
        { names: ['audit', 'audit'] },
        { directory: '' },
        { verify: true },
    ])('rejects invalid setup before creating output: %j', async (invalid) => {
        const { root, options } = await setup();

        await expect(skills.prepareSkills({ ...options, ...invalid } as never)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(await fs.readdir(root)).toEqual([]);
    });

    it('rejects a verifier returning false instead of asserting, without replacing old output', async () => {
        const { root, options } = await setup();

        await skills.prepareSkills(options);

        const verify: () => void = () => false;

        await expect(skills.prepareSkills({
            ...options,
            names: ['design'],
            verify,
        })).rejects.toThrow(InvalidAgentDefinitionError);
        expect(await fs.readFile(join(options.directory, 'audit/SKILL.md'), 'utf8')).toContain('PRIVATE BODY');
        expect(await fs.readdir(root)).toEqual(['corpus']);
    });

    it.each(['backup', 'promotion'])('preserves the old corpus and cleans staging when the %s rename fails', async (failure) => {
        const { root, options } = await setup();

        await skills.prepareSkills(options);

        const rename = fs.rename.bind(fs);

        vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
            if ((failure === 'promotion' && String(source).endsWith('/.agents/skills')) ||
                (failure === 'backup' && String(destination).endsWith('/previous'))) {
                throw new Error('rename failed');
            }

            return rename(source, destination);
        });
        await expect(skills.prepareSkills({ ...options, names: ['design'] })).rejects.toMatchObject({ code: skills.SKILL_PREPARATION_FAILED_ERROR_CODE });
        expect(await fs.readFile(join(options.directory, 'audit/SKILL.md'), 'utf8')).toContain('PRIVATE BODY');
        expect(await fs.readdir(root)).toEqual(['corpus']);
    });

    it('does not disclose malformed source YAML in diagnostics', async () => {
        const { options } = await setup({ 'skills/audit/SKILL.md': '---\nname: audit\ndescription: [PRIVATE-YAML-SECRET\n---\n' });
        const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(skills.prepareSkills(options)).rejects.toThrow(InvalidAgentDefinitionError);
        expect(JSON.stringify(warnings.mock.calls)).not.toContain('PRIVATE-YAML-SECRET');
    });

    it('does not emit unknown-tag YAML diagnostics containing source text', async () => {
        const { options } = await setup({ 'skills/audit/SKILL.md': '---\nname: audit\ndescription: !unknown PRIVATE-TAG-SECRET\n---\nBODY\n' });
        const warnings = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});

        await skills.prepareSkills(options);
        expect(warnings.mock.calls.map(([warning]) => String(warning)).join('\n')).not.toContain('PRIVATE-TAG-SECRET');
        // the filter is gone after the preparation and other warnings pass through
        expect(process.emitWarning).toBe(warnings);
        process.emitWarning('OTHER WARNING');
        expect(warnings).toHaveBeenLastCalledWith('OTHER WARNING');
    });

    it('redacts source credentials and verifier failures', async () => {
        const { options } = await setup();
        let message = '';

        try {
            await skills.prepareSkills({
                ...options,
                verify: () => {
                    throw new Error('password-and-private-body');
                },
            });
        } catch (error) {
            message = String(error);
        }

        expect(message).toContain('prepare');
        expect(message).not.toContain('password-and-private-body');
        await expect(skills.prepareSkills({ ...options, source: 'file:///missing/password-secret.git' })).rejects.toThrow(InvalidAgentDefinitionError);
    });

    it('copies scripts as data without executing them', async () => {
        const { root, options } = await setup({ 'skills/audit/scripts/run.sh': 'exit 99\n' });
        const [skill] = await skills.prepareSkills(options);

        expect(await fs.readFile(join(skill!.path, 'scripts/run.sh'), 'utf8')).toBe('exit 99\n');
        expect(await fs.readdir(root)).toEqual(['corpus']);
    });
});
