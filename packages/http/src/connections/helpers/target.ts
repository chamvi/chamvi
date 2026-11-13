/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Connection,
    DeclaredConnection,
    IConnectionTypeProvider,
} from '@chamvi/core';
import type { ConfigTarget, ConnectionServiceContext } from '../types.ts';

export function accountOf(name: string, type: string): string | undefined {
    return name.startsWith(`${type}-`) ? name.slice(type.length + 1) : undefined;
}

/**
 * A provider's list is the state of the last start: a stored account deleted
 * since has no row and is not declared, and neither is a row created under
 * its name after that start (another `createdAt`), which must not inherit the
 * env and code values the start resolved for the account it loaded (#197).
 * Connections with no row by nature (env, module) are not deletable, so a
 * missing row says nothing.
 */
export function isDeleted(ctx: ConnectionServiceContext, declared: DeclaredConnection, row: Pick<Connection, 'createdAt'> | undefined): boolean {
    if (ctx.connectionConfigs === undefined || !declared.deletable) {
        return false;
    }

    const { loadedCreatedAt } = declared;

    return !row || (loadedCreatedAt !== undefined && row.createdAt.getTime() !== loadedCreatedAt.getTime());
}

/** Whether the last start loaded `name`: the process holds it until a restart, whatever the store says now. */
export function isLoaded(ctx: ConnectionServiceContext, name: string): boolean {
    return ctx.connectionTypes().some((provider) => provider.connections().some((connection) => connection.name === name));
}

export async function findDeclared(ctx: ConnectionServiceContext, name: string): Promise<ConfigTarget | undefined> {
    for (const provider of ctx.connectionTypes()) {
        const declared = provider.connections().find((connection) => connection.name === name);

        if (declared) {
            const row = declared.deletable ? await ctx.store.connections?.findOne(name) : undefined;

            return isDeleted(ctx, declared, row) ?
                undefined :
                {
                    name,
                    definition: provider.definition,
                    declared,
                };
        }
    }

    return undefined;
}

export function creatableProvider(ctx: ConnectionServiceContext, type: string): IConnectionTypeProvider | undefined {
    return ctx.connectionTypes().find((provider) => provider.definition.type === type && provider.creatable());
}

/** The declared connection, else a stored account of a creatable type (created after the start). */
export async function findTarget(ctx: ConnectionServiceContext, name: string): Promise<ConfigTarget | undefined> {
    const declared = await findDeclared(ctx, name);

    if (declared) {
        return declared;
    }

    const row = ctx.connectionConfigs ? await ctx.store.connections?.findOne(name) : undefined;
    const provider = row && creatableProvider(ctx, row.type);

    return provider ? { name, definition: provider.definition } : undefined;
}

export function isEditable(ctx: ConnectionServiceContext, target: ConfigTarget): boolean {
    return ctx.connectionConfigs !== undefined && (target.declared?.editable ?? true);
}

export function isDeletable(ctx: ConnectionServiceContext, target: ConfigTarget): boolean {
    return ctx.connectionConfigs !== undefined && (target.declared?.deletable ?? target.definition.multiple);
}
