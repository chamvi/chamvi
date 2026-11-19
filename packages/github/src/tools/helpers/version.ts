/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import { requireString } from './input.ts';

type Version = { core: number[]; pre: string[] };

/** The version a release tag names: `tagPrefix` and a leading `v` removed, else undefined (no version). */
export function versionOf(tag: string, tagPrefix = ''): Version | undefined {
    if (!tag.startsWith(tagPrefix)) {
        return undefined;
    }

    const match = /^v?(\d+(?:\.\d+){0,3})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(tag.slice(tagPrefix.length));

    if (!match?.[1]) {
        return undefined;
    }

    return { core: match[1].split('.').map(Number), pre: match[2] ? match[2].split('.') : [] };
}

function comparePre(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) {
        return b.length - a.length;
    }

    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i];
        const y = b[i];

        if (x === undefined || y === undefined) {
            return x === undefined ? -1 : 1;
        }

        const numeric = /^\d+$/.test(x) && /^\d+$/.test(y);

        if (numeric && Number(x) !== Number(y)) {
            return Number(x) - Number(y);
        }

        if (!numeric && x !== y) {
            return x < y ? -1 : 1;
        }
    }

    return 0;
}

/** Semver order; missing components count as 0 (`1.2` equals `1.2.0`). */
export function compareVersions(a: Version, b: Version): number {
    for (let i = 0; i < Math.max(a.core.length, b.core.length); i++) {
        const diff = (a.core[i] ?? 0) - (b.core[i] ?? 0);

        if (diff !== 0) {
            return diff;
        }
    }

    return comparePre(a.pre, b.pre);
}

/** A version bound of the input (`from`, `to`), else a ValidationError. */
export function versionBound(value: unknown, name: string, tagPrefix: string): Version | undefined {
    if (value === undefined) {
        return undefined;
    }

    const text = requireString(value, name);
    const version = versionOf(text.startsWith(tagPrefix) ? text : `${tagPrefix}${text}`, tagPrefix);

    if (!version) {
        throw new ValidationError(`${name} must be a version like 1.2.3 or v1.2.3, got ${JSON.stringify(text)}.`);
    }

    return version;
}
