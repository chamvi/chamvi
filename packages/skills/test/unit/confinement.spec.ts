/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

it.each(['skill folder', 'conventional container'] as const)('does not select a skill reached through a committed symlinked %s', async (route) => {
    const {
        fixture,
        root,
        options,
        previous,
        outside,
        commit,
    } = await setup();

    await fs.mkdir(join(outside, 'linked'));
    await fs.writeFile(join(outside, 'linked/SKILL.md'), document('linked', 'DUMMY OUTSIDE BODY'));

    if (route === 'skill folder') {
        await fs.symlink(join(outside, 'linked'), join(fixture.path, 'skills/linked'));
    } else {
        await fs.symlink(outside, join(fixture.path, 'container'));
    }

    const revision = await commit();

    await expect(prepareSkills({
        ...options, 
        revision, 
        names: ['linked'], 
    })).rejects.toThrow(InvalidAgentDefinitionError);
    expect(await fs.readdir(previous.path)).toEqual(['SKILL.md']);
    expect((await fs.readdir(root)).sort()).toEqual(['corpus', 'outside']);
});

it('tolerates a tracked symlink outside the selected skills and copies only the selected folder', async () => {
    const {
        fixture,
        options,
        commit,
    } = await setup();

    await fs.symlink('README.md', join(fixture.path, 'unselected-link'));
    await fs.symlink('../README.md', join(fixture.path, 'skills/readme-link'));

    const revision = await commit();
    const [skill] = await prepareSkills({ ...options, revision });

    expect((await fs.readdir(options.directory)).sort()).toEqual(['.chamvi-skills', 'audit']);
    expect(await fs.readdir(skill!.path)).toEqual(['SKILL.md']);
    expect(await fs.readFile(join(skill!.path, 'SKILL.md'), 'utf8')).toBe(document('audit', 'ORIGINAL BODY'));
});
