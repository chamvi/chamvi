/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { expect } from 'vitest';
import type { IEntityRepository } from '@chamvi/store';
import type { EntityContractChild, EntityContractParent, EntityContractRecord } from './types.ts';
import { AT } from './constants.ts';

export function uuid(n: number): string {
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export function parentOf(n: number, patch: Partial<EntityContractParent> = {}): EntityContractParent {
    return {
        id: uuid(n),
        name: `parent-${n}`,
        note: null,
        counter: 0,
        label: `label-${n}`,
        createdAt: new Date(AT + (n * 1000)),
        ...patch,
    };
}

export function childOf(n: number, parent: number, patch: Partial<EntityContractChild> = {}): EntityContractChild {
    return {
        id: uuid(n),
        parentId: uuid(parent),
        label: `child-${n}`,
        ...patch,
    };
}

export function recordOf(n: number, name: string, value: number): EntityContractRecord {
    return {
        id: uuid(n),
        scope: 's',
        name,
        value,
    };
}

export async function insertParent(
    parents: IEntityRepository<EntityContractParent>,
    n: number,
    patch: Partial<EntityContractParent> = {},
): Promise<EntityContractParent> {
    return parents.save(parents.create(parentOf(n, patch)));
}

export function idsOf(rows: { id: string }[]): string[] {
    return rows.map((row) => row.id);
}

export async function errorOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    return expect.unreachable('expected a rejection');
}
