/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { SKILL_CONTROL_PATTERN } from '../constants.ts';
import type { Skill } from '../types.ts';
import { compareSkillPaths, copySkillIdentity } from './identity.ts';
import { invalidSkill } from './invalid.ts';

export function copySkill(value: unknown): Skill {
    const identity = copySkillIdentity(value);

    if (!isObject(value)) {
        invalidSkill('invalid content');
    }

    if (typeof value.description !== 'string' || !value.description.isWellFormed() || !value.description.trim()) {
        invalidSkill('invalid description');
    }

    if (value.description.length > 1024 || SKILL_CONTROL_PATTERN.test(value.description)) {
        invalidSkill('invalid description');
    }

    if (!Array.isArray(value.ignoredFields)) {
        invalidSkill('invalid ignored fields');
    }

    const hasInvalidIgnoredField = value.ignoredFields.some((field) => typeof field !== 'string' || !field.isWellFormed() || SKILL_CONTROL_PATTERN.test(field));

    if (hasInvalidIgnoredField) {
        invalidSkill('invalid ignored fields');
    }

    if (typeof value.body !== 'string' || !value.body.isWellFormed() || Buffer.byteLength(value.body) > 64 * 1024) {
        invalidSkill('body exceeds 64 KiB or is not text');
    }

    if (value.body.includes('\0')) {
        invalidSkill('body contains NUL');
    }

    if (!isObject(value.references) || Object.keys(value.references).length > 63) {
        invalidSkill('invalid references');
    }

    const references: Record<string, string> = Object.create(null);
    let bytes = Buffer.byteLength(value.body);

    for (const path of Object.keys(value.references).sort(compareSkillPaths)) {
        if (!path.isWellFormed() || path.includes('\\') || SKILL_CONTROL_PATTERN.test(path)) {
            invalidSkill('invalid reference path');
        }

        const segments = path.split('/');

        const hasInvalidSegment = segments.some((part) => !part || part.startsWith('.'));

        if (hasInvalidSegment || path === 'SKILL.md') {
            invalidSkill('invalid reference path');
        }

        const content = value.references[path];

        if (typeof content !== 'string' || !content.isWellFormed() || Buffer.byteLength(content) > 128 * 1024) {
            invalidSkill('reference exceeds 128 KiB or is not text');
        }

        if (content.includes('\0')) {
            invalidSkill('reference contains NUL');
        }

        bytes += Buffer.byteLength(content);
        references[path] = content;
    }

    if (bytes > 1024 * 1024) {
        invalidSkill('bundle exceeds 1 MiB');
    }

    return Object.freeze({
        ...identity,
        description: value.description,
        ignoredFields: Object.freeze([...value.ignoredFields].sort(compareSkillPaths)),
        body: value.body,
        references: Object.freeze(references),
    });
}
