/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import { ConnectionChangedError, assertConnectionName, storedConnectionName } from '@chamvi/core';
import type { ConnectionConfigUpdate, ConnectionValues, IConnectionConfigStore } from '@chamvi/core';
import { ConflictError, NotFoundError } from '@ebec/http';
import { Container } from 'validup';
import { forbidden, isGranted } from '../../auth/helpers.ts';
import type { Principal } from '../../auth/types.ts';
import { validateBody } from '../../request/helpers.ts';
import type { UiPage } from '../../static/types.ts';
import { NO_STORE_MESSAGE } from '../constants.ts';
import {
    assertConnectionAccess,
    assertSecretsRebound,
    assertUnique,
    buildSettingsView,
    connectionResource,
    findDeclared,
    findTarget,
    identityValues,
    isAccountId,
    isDeletable,
    isEditable,
    isLoaded,
    isRecord,
    isSecretsWrite,
    isUnchanged,
    lockedValues,
    refuseWithoutKeyring,
    runTest,
    serializeType,
    testFailureMessage,
    toConfigUpdate,
} from '../helpers/index.ts';
import type {
    ConfigTarget,
    ConnectionConfigServiceContext,
    ConnectionCreateBody,
    ConnectionSaveBody,
    ConnectionSettingsView,
    ConnectionTestView,
    ConnectionTypeView,
    IConnectionConfigService,
} from '../types.ts';

/** The configuration API over the connection types, the config store and the stored rows. */
export class ConnectionConfigService implements IConnectionConfigService {
    protected ctx: ConnectionConfigServiceContext;

    constructor(ctx: ConnectionConfigServiceContext) {
        this.ctx = ctx;
    }

    async types(): Promise<{ data: ConnectionTypeView[] }> {
        const seen = new Set<string>();
        const types: ConnectionTypeView[] = [];

        // a type with named instances may have one provider per module: the listing has one entry
        for (const provider of this.ctx.connectionTypes()) {
            if (!seen.has(provider.definition.type)) {
                seen.add(provider.definition.type);
                types.push(serializeType(this.ctx, provider));
            }
        }

        return { data: types };
    }

    async uiPages(): Promise<{ data: UiPage[] }> {
        return {
            data: this.ctx.uiPages().map((page) => ({
                ...page,
                path: `${this.ctx.basePath}${page.path}`,
            })),
        };
    }

    async create(type: string, data: ConnectionCreateBody, principal: Principal): Promise<ConnectionSettingsView & { name: string }> {
        // before the 404, so an unknown type is refused like a foreign one
        if (!await isGranted(principal, Permission.CONNECTION_CREATE, this.ctx.clock, { type })) {
            throw forbidden(Permission.CONNECTION_CREATE);
        }

        const provider = this.ctx.connectionTypes().find((candidate) => candidate.definition.type === type);

        if (!provider) {
            throw new NotFoundError({ message: `The connection type "${type}" does not exist.` });
        }

        const { definition } = provider;
        const configs = this.requireConfigs();

        if (!definition.multiple || !provider.creatable()) {
            throw new ConflictError({ message: `Accounts of the type "${type}" cannot be added here.` });
        }

        const container = new Container<ConnectionCreateBody>();

        container.mount('account', isAccountId());
        container.mount('settings', isRecord());
        container.mount('secrets', { optional: true }, isRecord());

        const body = await validateBody(container, data);
        const name = storedConnectionName(type, body.account);

        assertConnectionName(name);

        if (await findDeclared(this.ctx, name)) {
            throw new ConflictError({ message: `The connection "${name}" already exists.` });
        }

        const update = toConfigUpdate(definition, { settings: body.settings, ...(body.secrets && { set: body.secrets }) }, undefined, undefined);

        await assertUnique(this.ctx, definition, { ...update.settings, ...update.secrets?.set } as ConnectionValues);
        await refuseWithoutKeyring(async () => {
            if (!await configs.create(name, type, update)) {
                await this.repairBareRow(name, type, update);
            }
        });

        return { name, ...await buildSettingsView(this.ctx, { name, definition }) };
    }

    async read(name: string, principal: Principal): Promise<ConnectionSettingsView> {
        const target = await this.requireTarget(principal, name);

        return buildSettingsView(this.ctx, target);
    }

    async update(name: string, data: ConnectionSaveBody, principal: Principal): Promise<ConnectionSettingsView> {
        const target = await this.requireTarget(principal, name, true);
        const configs = this.requireConfigs();

        if (!isEditable(this.ctx, target)) {
            throw new ConflictError({ message: `The connection "${target.name}" is set in code and cannot be edited here.` });
        }

        const container = new Container<ConnectionSaveBody>();

        container.mount('settings', { optional: true }, isRecord());
        container.mount('secrets', { optional: true }, isSecretsWrite());

        const body = await validateBody(container, data);
        const stored = await configs.describe(target.name);
        const update = toConfigUpdate(target.definition, {
            ...(body.settings && { settings: body.settings }),
            ...(body.secrets?.set && { set: body.secrets.set }),
            ...(body.secrets?.clear && { clear: body.secrets.clear }),
        }, target, stored);

        assertSecretsRebound(target, stored, update);

        if (update.settings && target.definition.uniqueId) {
            const before = target.definition.uniqueId(identityValues(target, stored?.settings));
            const after = identityValues(target, update.settings);

            // an unchanged identity stays allowed: env may already declare a twin
            if (target.definition.uniqueId(after) !== before) {
                await assertUnique(this.ctx, target.definition, after, target.name);
            }
        }

        if (isUnchanged(update, stored)) {
            return buildSettingsView(this.ctx, target);
        }

        await refuseWithoutKeyring(async () => {
            // a declared connection has no row until its first save; create leaves an existing one alone.
            // The checks above read `stored`: a save that landed since then refuses this one (409),
            // so a rebinding check never passes on a snapshot another save replaced
            if (stored) {
                await configs.update(target.name, update, { revision: stored.revision });
            } else if (!await configs.create(target.name, target.definition.type, update)) {
                // another save created the row meanwhile: these checks never saw its values
                throw new ConnectionChangedError(target.name);
            }
        });

        return buildSettingsView(this.ctx, target);
    }

    async delete(name: string, principal: Principal): Promise<{ restartRequired: boolean }> {
        const target = await this.requireTarget(principal, name, true);
        const configs = this.requireConfigs();

        if (!isDeletable(this.ctx, target)) {
            throw new ConflictError({ message: `The connection "${target.name}" is declared by a module or the environment and cannot be deleted.` });
        }

        await configs.delete(target.name, `http:${principal.id}`);

        return { restartRequired: isLoaded(this.ctx, target.name) };
    }

    async test(name: string, signal: AbortSignal, principal: Principal): Promise<ConnectionTestView> {
        const target = await this.requireTarget(principal, name, true);
        const { definition } = target;
        // a module's own test (its endpoint, its fetch) wins over the type's, which the first module built
        const test = target.declared?.test ?? definition.test;

        if (!test) {
            throw new NotFoundError({ message: `The connection type "${definition.type}" offers no test.` });
        }

        const editable = isEditable(this.ctx, target);
        // only what is saved: the request body is never read. A connection set in code never loads the store,
        // so a row an earlier deployment left says nothing about it and is not read
        const stored = editable ?
            await refuseWithoutKeyring(async () => this.ctx.connectionConfigs?.read(target.name)) :
            undefined;
        const values: ConnectionValues = { ...stored?.values, ...lockedValues(target) };
        const missing = definition.fields.filter((field) => field.required && !Object.hasOwn(values, field.key));

        if (missing.length > 0) {
            // a built App passed in code holds no values this process could test with
            throw new ConflictError({
                message: editable ?
                    `Save ${missing.map((field) => field.label).join(', ')} first.` :
                    `The connection "${target.name}" is set in code and cannot be tested here.`,
            });
        }

        try {
            await runTest(this.ctx, test, values, signal);

            return { ok: true };
        } catch (error) {
            const secrets = definition.fields
                .filter((field) => field.kind === 'secret')
                .map((field) => values[field.key])
                .filter((value): value is string => typeof value === 'string');

            return { ok: false, message: testFailureMessage(error, secrets) };
        }
    }

    /**
     * The target `name` the principal may read, or may write with `write`: 403
     * before the 404 (an unknown name is checked without a type), so a
     * principal without the grant cannot probe names; then 404.
     */
    protected async requireTarget(principal: Principal, name: string, write = false): Promise<ConfigTarget> {
        let target: ConfigTarget | undefined;
        let failure: { error: unknown } | undefined;

        try {
            target = await findTarget(this.ctx, name);
        } catch (error) {
            // a lookup refusing the name (400) answers only a principal the check lets through
            failure = { error };
        }

        await assertConnectionAccess(this.ctx, principal, connectionResource(name, target?.definition.type), write);

        if (failure) {
            throw failure.error;
        }

        if (!target) {
            throw new NotFoundError({ message: `The connection "${name}" has no configuration.` });
        }

        return target;
    }

    protected requireConfigs(): IConnectionConfigStore {
        if (!this.ctx.connectionConfigs) {
            throw new ConflictError({ message: NO_STORE_MESSAGE });
        }

        return this.ctx.connectionConfigs;
    }

    /**
     * `create` found the name taken: a row with no config is what a crash between
     * the row and its config leaves, so the typed values repair it; anything else
     * is a real clash. The same row is what a create in flight holds before its
     * config write, so the repair is guarded by the revision it read: one of the
     * two writes is refused (409).
     */
    protected async repairBareRow(name: string, type: string, update: ConnectionConfigUpdate): Promise<void> {
        const configs = this.requireConfigs();
        const row = await this.ctx.store.connections?.findOne(name);
        const stored = await configs.describe(name);

        if (row?.type !== type || stored?.revision !== 0) {
            throw new ConflictError({ message: `The connection "${name}" already exists.` });
        }

        await configs.update(name, update, { revision: stored.revision });
    }
}
