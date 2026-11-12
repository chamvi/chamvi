/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import type { SkillInput } from '@chamvi/core';
import type {
    ApprovedSkill,
    ISkillSource,
    LoadedSkill,
    Skill,
    SkillCatalog,
    SkillIdentity,
    SkillMetadata,
} from '@chamvi/skills';
import * as skills from '@chamvi/skills';
import { expect, expectTypeOf, it } from 'vitest';

it('exports the Chamvi source, preparation and verified bundle API from main', () => {
    expect(Object.keys(skills).sort()).toEqual([
        'SKILL_PREPARATION_FAILED_ERROR_CODE',
        'SKILL_PREPARATION_LOCKED_ERROR_CODE',
        'SKILL_PREPARATION_LOCK_STALE_MS',
        'createSkillCatalog',
        'defineSkill',
        'defineSkillSource',
        'gitSkills',
        'hashSkillBundle',
        'loadSkillBundle',
        'loadSkillBundles',
        'prepareSkills',
    ]);
    expectTypeOf<ReturnType<typeof skills.gitSkills>>().toEqualTypeOf<ISkillSource & SkillInput>();
    expectTypeOf<ReturnType<typeof skills.loadSkillBundle>>().toEqualTypeOf<Skill & SkillInput>();
    expectTypeOf<Skill>().toExtend<SkillIdentity>();
    expectTypeOf<SkillCatalog['skills']>().toEqualTypeOf<readonly SkillMetadata[]>();
    expectTypeOf<LoadedSkill['references']>().toEqualTypeOf<string[]>();
    expectTypeOf<Parameters<typeof skills.loadSkillBundles>[0]>().toEqualTypeOf<readonly ApprovedSkill[]>();
});

it('keeps the official SDK range and runtime graph app-free', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

    expect(pkg.dependencies.skills).toBe('^1.8.1');
    expect(pkg.dependencies).not.toHaveProperty('@chamvi/app');
    expect(pkg.peerDependencies).not.toHaveProperty('@chamvi/app');
    expect(Object.keys(pkg.exports).sort()).toEqual(['.', './package.json']);
});
