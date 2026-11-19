/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type {
    ISkillSource,
    RuntimeSkillInput,
    RuntimeSkillSource,
    SkillIdentity,
} from '../types.ts';
import { composeSkillIdentities, copySkillIdentity } from './identity.ts';
import { invalidSkill } from './invalid.ts';
import { copySkill } from './skill.ts';

export function isSkillSource(value: unknown): value is RuntimeSkillSource {
    return isObject(value) && 'load' in value;
}

export function copySkillSource(input: unknown): RuntimeSkillSource {
    if (!isObject(input) || typeof input.load !== 'function' || !Array.isArray(input.skills)) {
        invalidSkill('invalid source');
    }

    const skills = Object.freeze(input.skills.map(copySkillIdentity));

    composeSkillIdentities(skills);

    const identity = 'sourceIdentity' in input ? input.sourceIdentity : input;

    if (!isObject(identity)) {
        invalidSkill('invalid source identity token');
    }

    // Bound loaders and structural tokens survive copies from another installed package.
    const load: ISkillSource['load'] = input.load.bind(input);

    return Object.freeze({
        skills,
        sourceIdentity: identity,
        load,
    });
}

export function copySkillInputs(inputs: readonly unknown[] = []): readonly RuntimeSkillInput[] {
    if (!Array.isArray(inputs)) {
        invalidSkill('inputs must be an array');
    }

    return Object.freeze(inputs.map((input) => isSkillSource(input) ? copySkillSource(input) : copySkill(input)));
}

export function skillHeaders(inputs: readonly RuntimeSkillInput[]): readonly SkillIdentity[] {
    return inputs.flatMap((input) => isSkillSource(input) ? [...input.skills] : [input]);
}
