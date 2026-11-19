/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Skill,
    SkillIdentity,
} from '../types.ts';
import { sameSkill } from './identity.ts';
import { invalidSkill } from './invalid.ts';

export function assertSkillToolCollision(headers: readonly SkillIdentity[], tools: Record<string, unknown>): void {
    if (headers.length && 'load_skill' in tools) {
        invalidSkill('load_skill collides with an agent tool');
    }
}

export function assertSkillContents(skills: readonly Skill[]): void {
    const contents = new Map<string, string>();

    for (const skill of skills) {
        const serialized = JSON.stringify(skill);
        const previous = contents.get(skill.name);

        if (previous !== undefined && previous !== serialized) {
            invalidSkill(`conflicting content for ${skill.name}`);
        }

        contents.set(skill.name, serialized);
    }
}

export function assertSkillResultIdentities(headers: readonly SkillIdentity[], skills: readonly Skill[]): void {
    if (headers.length !== skills.length) {
        invalidSkill('source result does not match declared skills');
    }

    for (const header of headers) {
        const hasNoMatchingSkill = skills.every((skill) => !sameSkill(header, skill));

        if (hasNoMatchingSkill) {
            invalidSkill('source result does not match declared skills');
        }
    }

    for (const skill of skills) {
        const hasNoMatchingHeader = headers.every((header) => !sameSkill(header, skill));

        if (hasNoMatchingHeader) {
            invalidSkill('source result does not match declared skills');
        }
    }
}
