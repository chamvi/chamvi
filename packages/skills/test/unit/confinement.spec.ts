/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { prepareSkills } from '@chamvi/skills';
import { createGitFixture } from '@chamvi/test-kit';
import type { GitFixture } from '@chamvi/test-kit';
import {
    afterEach,
    expect,
    it,
} from 'vitest';

const fixtures: GitFixture[] = [];
const roots: string[] = [];
const document = (name: string, body: string) => `---\nname: ${name}\ndescription: Fixture\n---\n${body}\n`;

afterEach(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
    fixtures.length = 0;
    roots.length = 0;
});

async function setup() {
    const fixture = await createGitFixture({
        'skills/audit/SKILL.md': document('audit', 'ORIGINAL BODY'),
        'README.md': 'DUMMY SOURCE README\n',
        'notes\n120000 fake-link': 'DUMMY REGULAR FILE\n',
    });

    fixtures.push(fixture);

    const root = await fs.mkdtemp(join(tmpdir(), 'chamvi-confinement-'));

    roots.push(root);

    const options = {
        source: fixture.path,
        revision: fixture.commit,
        names: ['audit'],
        directory: join(root, 'corpus'),
    };
    const [previous] = await prepareSkills(options);
    const outside = join(root, 'outside');

    await fs.mkdir(outside);
    await fs.writeFile(join(outside, 'outside.txt'), 'DUMMY OUTSIDE FILE\n');

    const commit = async () => {
        await fixture.git('add', '--all');
        await fixture.git('commit', '-m', 'source links');

        return (await fixture.git('rev-parse', 'HEAD')).trim();
    };

    return {
        fixture,
        root,
        options,
        previous: previous!,
        outside,
        commit,
    };
}

it.each(['nested alias', 'external file'] as const)('refuses a selected skill containing a committed %s and retains the previous corpus', async (route) => {
    const {
        fixture,
        root,
        options,
        previous,
        outside,
        commit,
    } = await setup();
    const skill = join(fixture.path, 'skills/audit');

    if (route === 'nested alias') {
        await fs.mkdir(join(skill, 'real'));
        await fs.writeFile(join(skill, 'real/inside.txt'), 'INSIDE\n');
        await fs.symlink('real', join(skill, 'alias'));
    } else {
        await fs.symlink(join(outside, 'outside.txt'), join(skill, 'external.txt'));
    }

    const revision = await commit();

    await expect(prepareSkills({ ...options, revision })).rejects.toThrow(InvalidAgentDefinitionError);
    expect(await fs.readFile(join(previous.path, 'SKILL.md'), 'utf8')).toBe(document('audit', 'ORIGINAL BODY'));
    expect(await fs.readdir(previous.path)).toEqual(['SKILL.md']);
    expect((await fs.readdir(root)).sort()).toEqual(['corpus', 'outside']);
});

it.each(['skills container', 'agent container', 'relative escaping container'] as const)('refuses a committed %s link before anything is copied', async (route) => {
    const {
        fixture,
        root,
        options,
        previous,
        outside,
        commit,
    } = await setup();

    // a real skill on the host, reachable only through the committed link
    const host = join(outside, route === 'agent container' ? 'skills/foo' : 'foo');

    await fs.mkdir(host, { recursive: true });
    await fs.writeFile(join(host, 'SKILL.md'), document('foo', 'HOST BODY'));
    await fs.writeFile(join(host, 'secret.txt'), 'HOST SECRET\n');

    if (route === 'agent container') {
        await fs.symlink(outside, join(fixture.path, '.claude'));
    } else {
        await fs.rm(join(fixture.path, 'skills'), { recursive: true });
        await fs.symlink(route === 'skills container' ? outside : relative(fixture.path, outside), join(fixture.path, 'skills'));
    }

    const revision = await commit();

    await expect(prepareSkills({
        ...options, 
        revision, 
        names: ['foo'], 
    })).rejects.toThrow(InvalidAgentDefinitionError);
    expect(await fs.readdir(options.directory)).toEqual(['.chamvi-skills', 'audit']);
    expect(await fs.readdir(previous.path)).toEqual(['SKILL.md']);
    expect((await fs.readdir(root)).sort()).toEqual(['corpus', 'outside']);
});

it('refuses a committed symlinked skill folder', async () => {
    const {
        fixture,
        root,
        options,
        outside,
        commit,
    } = await setup();

    await fs.mkdir(join(outside, 'linked'));
    await fs.writeFile(join(outside, 'linked/SKILL.md'), document('linked', 'DUMMY OUTSIDE BODY'));
    await fs.symlink(join(outside, 'linked'), join(fixture.path, 'skills/linked'));

    const revision = await commit();

    await expect(prepareSkills({
        ...options, 
        revision, 
        names: ['linked'], 
    })).rejects.toThrow(InvalidAgentDefinitionError);
    expect((await fs.readdir(root)).sort()).toEqual(['corpus', 'outside']);
});

it('refuses a tracked symlink anywhere in the source, including unselected paths', async () => {
    const {
        fixture,
        root,
        options,
        previous,
        commit,
    } = await setup();

    await fs.symlink('README.md', join(fixture.path, 'unselected-link'));

    const revision = await commit();

    await expect(prepareSkills({ ...options, revision })).rejects.toThrow(InvalidAgentDefinitionError);
    expect(await fs.readFile(join(previous.path, 'SKILL.md'), 'utf8')).toBe(document('audit', 'ORIGINAL BODY'));
    expect((await fs.readdir(root)).sort()).toEqual(['corpus', 'outside']);
});

it.each([
    ['mounted as the selected skill folder', 'skills/foo', 'foo'],
    ['inside the selected skill folder', 'skills/audit/vendor', 'audit'],
])('refuses a submodule %s', async (_, mount, name) => {
    const sub = await createGitFixture({ 'SKILL.md': document('foo', 'SUBMODULE BODY'), 'data.txt': 'SUBMODULE BYTES\n' });

    fixtures.push(sub);

    const {
        fixture,
        root,
        options,
        previous,
        commit,
    } = await setup();

    await fixture.git('-c', 'protocol.file.allow=always', 'submodule', 'add', sub.url, mount);

    const revision = await commit();

    await expect(prepareSkills({
        ...options, 
        revision, 
        names: [name], 
    })).rejects.toThrow(InvalidAgentDefinitionError);
    expect(await fs.readdir(previous.path)).toEqual(['SKILL.md']);
    expect((await fs.readdir(root)).sort()).toEqual(['corpus', 'outside']);
});
