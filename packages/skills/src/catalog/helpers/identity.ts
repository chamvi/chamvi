/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { SKILL_CONTROL_PATTERN, SKILL_MAX_BUNDLES, SKILL_NAME_PATTERN } from '../constants.ts';
import type { SkillIdentity } from '../types.ts';
import { invalidSkill } from './invalid.ts';

export function compareSkillPaths(a: string, b: string): number {
    return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

export function sameSkill(a: SkillIdentity, b: SkillIdentity): boolean {
    return a.name === b.name && a.version === b.version && a.hash === b.hash;
}

export function copySkillIdentity(value: unknown): SkillIdentity {
    if (!isObject(value) || typeof value.name !== 'string' || !SKILL_NAME_PATTERN.test(value.name)) {
        invalidSkill('invalid name');
    }

    if (typeof value.version !== 'string' || !value.version.isWellFormed() || !value.version.trim() || value.version.length > 128) {
        invalidSkill('version must be an exact release identifier');
    }

    if (SKILL_CONTROL_PATTERN.test(value.version) || /[\s*^~<>=|]/.test(value.version)) {
        invalidSkill('version must be an exact release identifier');
    }

    if (/(?:^|\.)x(?:\.|$)/i.test(value.version) || /^(latest|main|master|head)$/i.test(value.version)) {
        invalidSkill('version must be an exact release identifier');
    }

    if (typeof value.hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.hash)) {
        invalidSkill('hash must be a lowercase full digest');
    }

    return Object.freeze({
        name: value.name,
        version: value.version,
        hash: value.hash,
    });
}

export function composeSkillIdentities(skills: readonly SkillIdentity[]): readonly SkillIdentity[] {
    const names = new Map<string, SkillIdentity>();

    for (const skill of skills) {
        const previous = names.get(skill.name);

        if (previous && !sameSkill(previous, skill)) {
            invalidSkill(`conflicting identity for ${skill.name}`);
        }

        names.set(skill.name, skill);
    }

    if (names.size > SKILL_MAX_BUNDLES) {
        invalidSkill('at most 16 skills per agent');
    }

    return names.values().toArray().sort((a, b) => compareSkillPaths(a.name, b.name));
}
