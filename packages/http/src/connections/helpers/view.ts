/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IConnectionHandle, IConnectionTypeProvider } from '@chamvi/core';
import type {
    ConfigTarget,
    ConnectionServiceContext,
    ConnectionSettingsFieldView,
    ConnectionSettingsView,
    ConnectionTypeView,
    ConnectionView,
} from '../types.ts';
import { sourceOf } from './fields.ts';
import {
    accountOf,
    creatableProvider,
    isDeletable,
    isDeleted,
    isEditable,
} from './target.ts';

export function serializeConnection(handle: IConnectionHandle): ConnectionView {
    return {
        name: handle.name,
        type: handle.type,
        status: handle.status(),
    };
}

/** Read from the store on every call: a provider's snapshot is the state of the last start. */
export async function buildSettingsView(ctx: ConnectionServiceContext, target: ConfigTarget): Promise<ConnectionSettingsView> {
    const {
        definition,
        declared,
        name,
    } = target;
    const stored = await ctx.connectionConfigs?.describe(name);
    const loadedCreatedAt = declared?.loadedCreatedAt;
    // a delete and create again restarts the revision count: only the row's age tells them apart
    const row = loadedCreatedAt ? await ctx.store.connections?.findOne(name) : undefined;
    const recreated = row !== undefined && row.createdAt.getTime() !== loadedCreatedAt?.getTime();
    const fields: ConnectionSettingsFieldView[] = [];
    const settings: [string, unknown][] = [];

    for (const field of definition.fields) {
        const source = sourceOf(target, field, stored);

        fields.push({
            key: field.key,
            source,
            ...(field.kind === 'secret' && { set: source.kind !== 'unset' }),
        });

        if (field.kind !== 'secret' && source.kind === 'store') {
            settings.push([field.key, stored?.settings[field.key]]);
        }
    }

    const isSet = (key: string) => fields.some((field) => field.key === key && field.source.kind !== 'unset');
    const hasValue = definition.fields.some((field) => isSet(field.key));
    const missing = definition.fields.filter((field) => field.required && !isSet(field.key)).map((field) => field.label);
    // a pinned connection never loads the store: a leftover row is no pending change
    const restartRequired = declared?.editable !== false && (stored?.revision !== declared?.loadedRevision || recreated);
    // what the last start refused stays true until a restart applied a save
    const refused = !restartRequired && declared?.resolved.state === 'incomplete';
    // so does a module that declared itself idle (a policy in code without its credentials)
    const idle = !restartRequired && declared?.resolved.state === 'not_configured';
    let state: ConnectionSettingsView['state'] = 'not_configured';

    if (hasValue && !idle) {
        state = missing.length === 0 && !refused ? 'configured' : 'incomplete';
    }

    return {
        type: definition.type,
        state,
        ...(state === 'incomplete' && missing.length > 0 && { missing }),
        ...(refused && declared?.resolved.reason !== undefined && { reason: declared.resolved.reason }),
        settings: Object.fromEntries(settings),
        fields,
        restartRequired,
        editable: isEditable(ctx, target),
        deletable: isDeletable(ctx, target),
    };
}

export function serializeType(ctx: ConnectionServiceContext, provider: IConnectionTypeProvider): ConnectionTypeView {
    const { definition } = provider;

    return {
        type: definition.type,
        label: definition.label,
        multiple: definition.multiple,
        creatable: ctx.connectionConfigs !== undefined && definition.multiple && provider.creatable(),
        testable: definition.test !== undefined,
        fields: definition.fields.map((field) => ({
            key: field.key,
            label: field.label,
            kind: field.kind,
            ...(field.required !== undefined && { required: field.required }),
            ...(field.description !== undefined && { description: field.description }),
            ...(field.options !== undefined && { options: field.options }),
            ...(field.multiline !== undefined && { multiline: field.multiline }),
            ...(field.bindsSecrets !== undefined && { bindsSecrets: field.bindsSecrets }),
        })),
    };
}

/** What a listing shows of a connection's configuration: read from the store, as the form does. */
export async function configurationOf(ctx: ConnectionServiceContext, target: ConfigTarget): Promise<Pick<ConnectionView, 'state' | 'missing' | 'reason' | 'editable' | 'deletable'>> {
    const {
        state,
        missing,
        reason,
        editable,
        deletable,
    } = await buildSettingsView(ctx, target);

    return {
        state,
        ...(missing && { missing }),
        ...(reason !== undefined && { reason }),
        editable,
        deletable,
    };
}

/**
 * The handles, the declared connections (a handle's status joins its
 * declaration) and the accounts created after the start, unfiltered.
 */
export async function listConnections(ctx: ConnectionServiceContext): Promise<ConnectionView[]> {
    const views = new Map<string, ConnectionView>(ctx.connections().map((handle) => [handle.name, serializeConnection(handle)]));
    const declared = new Set<string>();
    const rows = ctx.connectionConfigs && ctx.connectionTypes().length > 0 ? await ctx.store.connections?.find() ?? [] : [];
    const rowsByName = new Map(rows.map((row) => [row.name, row]));

    for (const provider of ctx.connectionTypes()) {
        for (const connection of provider.connections()) {
            if (isDeleted(ctx, connection, rowsByName.get(connection.name))) {
                continue;
            }

            const target = {
                name: connection.name,
                definition: provider.definition,
                declared: connection,
            };

            declared.add(connection.name);
            views.set(connection.name, {
                ...(views.get(connection.name) ?? {
                    name: connection.name,
                    type: provider.definition.type,
                    status: 'disconnected',
                    live: false,
                }),
                ...(connection.account !== undefined && { account: connection.account }),
                ...await configurationOf(ctx, target),
            });
        }
    }

    for (const row of rows) {
        const provider = !declared.has(row.name) && creatableProvider(ctx, row.type);

        if (provider) {
            const account = accountOf(row.name, row.type);

            views.set(row.name, {
                ...(views.get(row.name) ?? {
                    name: row.name,
                    type: row.type,
                    status: 'disconnected',
                    live: false,
                }),
                ...(account !== undefined && { account }),
                ...await configurationOf(ctx, { name: row.name, definition: provider.definition }),
            });
        }
    }

    return views.values().toArray();
}
