/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type {
    ConnectionConfigUpdate,
    ConnectionConfigView,
    ConnectionField,
    ConnectionFieldSource,
    ConnectionTypeDefinition,
    ConnectionValue,
    ConnectionValues,
} from '@chamvi/core';
import { IssueCode, defineIssueItem } from '@ebec/core';
import type { Issue } from '@ebec/core';
import { ConflictError } from '@ebec/http';
import { ValidupError } from 'validup';
import type { ConfigTarget, ConnectionServiceContext, FormInput } from '../types.ts';
import { isStored, lockOf, normalizeSetting } from './fields.ts';
import { isDeleted } from './target.ts';

/** Saving needs the keyring when it seals or creates: its absence is a refusal naming the variable, not a 500. */
export async function refuseWithoutKeyring<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        if (error instanceof InvalidAgentDefinitionError) {
            // the keyring's messages name the variable and an entry index, never a value
            throw new ConflictError({ message: error.message });
        }

        throw error;
    }
}

/**
 * Turns a form into a store update, or throws a ValidupError with one issue
 * per field. Empty values are unset. Issues name known fields only and never
 * carry a value: a body may hold a secret anywhere.
 */
export function toConfigUpdate(
    definition: ConnectionTypeDefinition,
    input: FormInput,
    target: ConfigTarget | undefined,
    stored: ConnectionConfigView | undefined,
): ConnectionConfigUpdate {
    const issues: Issue[] = [];
    const fail = (path: string[], message: string) => {
        issues.push(defineIssueItem({
            code: IssueCode.VALUE_INVALID,
            path,
            message,
        }));
    };
    const fields = new Map(definition.fields.map((field) => [field.key, field]));
    const lockMessage = (lock: ConnectionFieldSource) => (lock.kind === 'env' ? `is set from ${lock.variable}` : 'is set in code');
    /** The field of a secret operation, after reporting every reason it cannot be written. */
    const secretField = (key: string, path: string[]): ConnectionField | undefined => {
        const field = fields.get(key);

        if (!field || field.kind !== 'secret') {
            fail(path.slice(0, -1), 'names a field that is no secret of this connection type');

            return undefined;
        }

        const lock = lockOf(target, field);

        if (lock) {
            fail(path, lockMessage(lock));

            return undefined;
        }

        return field;
    };
    const settings: [string, ConnectionValue][] = [];

    for (const [key, raw] of Object.entries(input.settings ?? {})) {
        const field = fields.get(key);

        if (!field) {
            fail(['settings'], 'names a field this connection type does not have');

            continue;
        }

        if (field.kind === 'secret') {
            fail(['settings', key], 'is a secret: send it in the secrets');

            continue;
        }

        const value = normalizeSetting(field, raw);

        if (value === undefined) {
            fail(['settings', key], `must be a valid ${field.kind}`);
        } else if (value !== null) {
            const lock = lockOf(target, field);

            if (lock) {
                fail(['settings', key], lockMessage(lock));
            } else {
                settings.push([key, value]);
            }
        }
    }

    const set: [string, string][] = [];

    for (const [key, raw] of Object.entries(input.set ?? {})) {
        // an untouched secret input keeps what is stored
        if (raw === '' || raw === null) {
            continue;
        }

        const path = ['secrets', 'set', key];

        if (secretField(key, path)) {
            if (typeof raw === 'string') {
                set.push([key, raw]);
            } else {
                fail(path, 'must be a string');
            }
        }
    }

    const clear = input.clear ?? [];
    const newSettings = Object.fromEntries(settings);
    const newSecrets = Object.fromEntries(set);

    for (const key of clear) {
        const path = ['secrets', 'clear', key];

        // the store applies a clear after a set: the new value would be dropped without a word
        if (secretField(key, path) && Object.hasOwn(newSecrets, key)) {
            fail(path, 'is also set: either set or clear it');
        }
    }

    // clearing is the one way a required value may go, also when an earlier clear already took another
    const clearOnly = !input.settings && set.length === 0 && clear.length > 0;

    for (const field of definition.fields) {
        if (clearOnly || !field.required || lockOf(target, field)) {
            continue;
        }

        if (field.kind === 'secret') {
            // a cleared one is allowed: the connection reports incomplete
            if (!clear.includes(field.key) && !Object.hasOwn(newSecrets, field.key) && !isStored(field, stored)) {
                fail(['secrets', 'set', field.key], 'is required');
            }
        } else if (input.settings ? !Object.hasOwn(newSettings, field.key) : !isStored(field, stored)) {
            fail(['settings', field.key], 'is required');
        }
    }

    if (issues.length > 0) {
        throw new ValidupError(issues);
    }

    const hasSecrets = set.length > 0 || clear.length > 0;

    return {
        ...(input.settings && { settings: newSettings }),
        ...(hasSecrets && {
            secrets: {
                ...(set.length > 0 && { set: newSecrets }),
                ...(clear.length > 0 && { clear: [...clear] }),
            },
        }),
    };
}

/** The values a test or a duplicate check sees: stored, with env and code winning. */
export function lockedValues(target: ConfigTarget): ConnectionValues {
    const { declared } = target;

    if (!declared) {
        return {};
    }

    return Object.fromEntries(Object.entries(declared.resolved.values).filter(([key]) => {
        const kind = declared.resolved.sources[key]?.kind;

        return kind === 'env' || kind === 'code';
    }));
}

/** What a duplicate check compares: the stored settings, with env and code winning. */
export function identityValues(target: ConfigTarget, settings: ConnectionConfigView['settings'] | undefined): ConnectionValues {
    return { ...settings as ConnectionValues | undefined, ...lockedValues(target) };
}

/** Refuses `values` when another connection of the type has their identity; `self` is the account being edited. */
export async function assertUnique(
    ctx: ConnectionServiceContext,
    definition: ConnectionTypeDefinition,
    values: ConnectionValues,
    self?: string,
): Promise<void> {
    if (!definition.uniqueId) {
        return;
    }

    const wanted = definition.uniqueId(values);
    const conflict = new ConflictError({ message: 'An account with the same identity already exists.' });
    const rows = await ctx.store.connections?.find() ?? [];
    const rowsByName = new Map(rows.map((row) => [row.name, row]));
    const declaredNames = new Set<string>();

    for (const candidate of ctx.connectionTypes()) {
        if (candidate.definition.type !== definition.type) {
            continue;
        }

        for (const declared of candidate.connections()) {
            if (isDeleted(ctx, declared, rowsByName.get(declared.name))) {
                continue;
            }

            declaredNames.add(declared.name);

            if (declared.name === self) {
                continue;
            }

            // a provider's list is the last start's: the store holds any edit since
            const stored = rowsByName.has(declared.name) ? await ctx.connectionConfigs?.describe(declared.name) : undefined;
            const current = stored ?
                identityValues({
                    name: declared.name, 
                    definition, 
                    declared, 
                }, stored.settings) :
                declared.resolved.values;

            if (definition.uniqueId(current) === wanted) {
                throw conflict;
            }
        }
    }

    for (const row of rows) {
        if (row.type !== definition.type || declaredNames.has(row.name) || row.name === self) {
            continue;
        }

        const stored = await ctx.connectionConfigs?.describe(row.name);

        if (stored && definition.uniqueId(stored.settings as ConnectionValues) === wanted) {
            throw conflict;
        }
    }
}

/**
 * A save moving a field that decides where secrets go must bring every secret
 * again: otherwise whoever may edit settings could send the stored ones to a
 * host of their choice. An env or code secret cannot be re-entered, so such a
 * change is refused (409, naming the field and the secret's origin only).
 */
export function assertSecretsRebound(target: ConfigTarget, stored: ConnectionConfigView | undefined, update: ConnectionConfigUpdate): void {
    if (!update.settings) {
        return;
    }

    const { fields } = target.definition;
    const moved = fields.filter((field) => field.bindsSecrets &&
        !lockOf(target, field) &&
        JSON.stringify(update.settings?.[field.key]) !== JSON.stringify(stored?.settings[field.key]));
    const [first] = moved;

    if (first === undefined) {
        return;
    }

    const issues: Issue[] = [];

    for (const field of fields) {
        if (field.kind !== 'secret') {
            continue;
        }

        const lock = lockOf(target, field);

        if (lock) {
            const origin = lock.kind === 'env' ? `${field.label} is set from ${lock.variable}` : `${field.label} is set in code`;

            throw new ConflictError({ message: `${first.label} cannot change here: ${origin}, and it decides where that secret is sent.` });
        }

        const carried = update.secrets?.set?.[field.key] !== undefined || update.secrets?.clear?.includes(field.key) === true;

        if (!carried && isStored(field, stored)) {
            issues.push(defineIssueItem({
                code: IssueCode.VALUE_INVALID,
                path: ['secrets', 'set', field.key],
                message: `must be entered again: ${first.label} changes where it is sent`,
            }));
        }
    }

    if (issues.length > 0) {
        throw new ValidupError(issues);
    }
}

/** Whether a save would leave the stored configuration as it is: such a save writes nothing and asks for no restart. */
export function isUnchanged(update: ConnectionConfigUpdate, stored: ConnectionConfigView | undefined): boolean {
    if (update.secrets) {
        return false;
    }

    if (!update.settings) {
        return true;
    }

    const before = stored?.settings ?? {};
    const keys = Object.keys(update.settings);

    return keys.length === Object.keys(before).length &&
        keys.every((key) => Object.hasOwn(before, key) && JSON.stringify(update.settings?.[key]) === JSON.stringify(before[key]));
}
