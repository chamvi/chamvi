/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ConnectionConfigView,
    ConnectionField,
    ConnectionFieldSource,
    ConnectionValue,
} from '@chamvi/core';
import type { ConfigTarget } from '../types.ts';

/** Well-formed text without NUL: what a Postgres `jsonb` column accepts. */
export function isStorableText(value: unknown): value is string {
    return typeof value === 'string' && !value.includes('\0') && value.isWellFormed();
}

/** A field env or code sets: never written here. */
export function lockOf(target: ConfigTarget | undefined, field: ConnectionField): ConnectionFieldSource | undefined {
    const source = target?.declared?.resolved.sources[field.key];

    return source?.kind === 'env' || source?.kind === 'code' ? source : undefined;
}

export function isStored(field: ConnectionField, stored: ConnectionConfigView | undefined): boolean {
    if (!stored) {
        return false;
    }

    return field.kind === 'secret' ? stored.secretsSet.includes(field.key) : Object.hasOwn(stored.settings, field.key);
}

export function sourceOf(target: ConfigTarget, field: ConnectionField, stored: ConnectionConfigView | undefined): ConnectionFieldSource {
    return lockOf(target, field) ?? (isStored(field, stored) ? { kind: 'store' } : { kind: 'unset' });
}

/** A setting's typed value, `null` for an empty one (unset), `undefined` when it does not fit the field. */
export function normalizeSetting(field: ConnectionField, raw: unknown): ConnectionValue | null | undefined {
    if (raw === null || raw === '') {
        return null;
    }

    switch (field.kind) {
        case 'number':
            return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined;
        case 'boolean':
            return typeof raw === 'boolean' ? raw : undefined;
        case 'list': {
            const isTextList = Array.isArray(raw) && raw.every(isStorableText);

            if (!isTextList) {
                return undefined;
            }

            const items = (raw as string[]).map((item) => item.trim()).filter((item) => item.length > 0);

            return items.length > 0 ? items : null;
        }
        case 'select':
            return isStorableText(raw) && (!field.options || field.options.includes(raw)) ? raw : undefined;
        default:
            return isStorableText(raw) ? raw : undefined;
    }
}
