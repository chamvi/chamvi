/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    ChamviError,
    ErrorCode,
    InvalidAgentDefinitionError,
    assertConnectionName,
    hasPermission,
    storedConnectionName,
} from '@chamvi/core';
import type {
    ConnectionConfigUpdate,
    ConnectionConfigView,
    ConnectionField,
    ConnectionFieldSource,
    ConnectionTypeDefinition,
    ConnectionValue,
    ConnectionValues,
    DeclaredConnection,
    IConnectionConfigStore,
    IConnectionTypeProvider,
} from '@chamvi/core';
import { IssueCode, defineIssueItem } from '@ebec/core';
import type { Issue } from '@ebec/core';
import { ConflictError, ForbiddenError, NotFoundError } from '@ebec/http';
import { defineCoreHandler } from 'routup';
import type { App } from 'routup';
import { Container, ValidupError } from 'validup';
import type { HttpContext } from '../app/types.ts';
import { CONNECTIONS_CREATE_PERMISSION } from '../auth/constants.ts';
import { authenticate } from '../auth/helpers.ts';
import { connectionPermission } from '../auth/module.ts';
import type { Principal } from '../auth/types.ts';
import { readJsonBody, validateBody } from '../request/helpers.ts';
import type { UiPage } from '../static/types.ts';
import {
    canRead,
    canWrite,
    isAccountId,
    isRecord,
    isSecretsWrite,
    param,
    serializeConnection,
} from './helpers.ts';
import type {
    ConnectionCreateBody,
    ConnectionSaveBody,
    ConnectionSettingsFieldView,
    ConnectionSettingsView,
    ConnectionTestView,
    ConnectionTypeView,
    ConnectionView,
} from './types.ts';

/** What a request addresses: a declared connection, or a stored account no process loaded yet. */
type ConfigTarget = {
    name: string;
    definition: ConnectionTypeDefinition;
    declared?: DeclaredConnection;
};

/** A test failure's message is cut to this; a provider's error text can be long. */
const TEST_MESSAGE_MAX_LENGTH = 500;

/** How long a connection test may take: its server may never answer, and an HTTP client may never go away. */
const TEST_TIMEOUT_MS = 30_000;

const NO_STORE_MESSAGE = 'This app stores no connections: its settings come from the environment or code.';

function accountOf(name: string, type: string): string | undefined {
    return name.startsWith(`${type}-`) ? name.slice(type.length + 1) : undefined;
}

/** Well-formed text without NUL: what a Postgres `jsonb` column accepts. */
function isStorableText(value: unknown): value is string {
    return typeof value === 'string' && !value.includes('\0') && value.isWellFormed();
}

/**
 * A provider's list is the state of the last start: a stored account deleted
 * since has no row, and is no longer declared. Connections with no row by
 * nature (env, module) are not deletable, so a missing row says nothing.
 */
function isDeleted(ctx: HttpContext, declared: DeclaredConnection, hasRow: boolean): boolean {
    return ctx.connectionConfigs !== undefined && declared.deletable && !hasRow;
}

async function findDeclared(ctx: HttpContext, name: string): Promise<ConfigTarget | undefined> {
    for (const provider of ctx.connectionTypes()) {
        const declared = provider.connections().find((connection) => connection.name === name);

        if (declared) {
            const hasRow = !declared.deletable || await ctx.store.connections?.findOne(name) !== undefined;

            return isDeleted(ctx, declared, hasRow) ?
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

function creatableProvider(ctx: HttpContext, type: string): IConnectionTypeProvider | undefined {
    return ctx.connectionTypes().find((provider) => provider.definition.type === type && provider.creatable());
}

/** The declared connection, else a stored account of a creatable type (created after the start). */
async function findTarget(ctx: HttpContext, name: string): Promise<ConfigTarget | undefined> {
    const declared = await findDeclared(ctx, name);

    if (declared) {
        return declared;
    }

    const row = ctx.connectionConfigs ? await ctx.store.connections?.findOne(name) : undefined;
    const provider = row && creatableProvider(ctx, row.type);

    return provider ? { name, definition: provider.definition } : undefined;
}

/**
 * The target `name` the principal may read, or may write with `write`: 403
 * before any lookup, so a principal without the grant cannot probe names;
 * then 404.
 */
async function requireTarget(ctx: HttpContext, principal: Principal, name: string, write = false): Promise<ConfigTarget> {
    if (write ? !canWrite(principal, name) : !canRead(principal, name)) {
        throw new ForbiddenError({ message: `Missing permission "${connectionPermission(name, write ? 'write' : 'read')}".` });
    }

    const target = await findTarget(ctx, name);

    if (!target) {
        throw new NotFoundError({ message: `The connection "${name}" has no configuration.` });
    }

    return target;
}

function requireConfigs(ctx: HttpContext): IConnectionConfigStore {
    if (!ctx.connectionConfigs) {
        throw new ConflictError({ message: NO_STORE_MESSAGE });
    }

    return ctx.connectionConfigs;
}

/** Saving needs the keyring when it seals or creates: its absence is a refusal naming the variable, not a 500. */
async function refuseWithoutKeyring<T>(run: () => Promise<T>): Promise<T> {
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

/** A field env or code sets: never written here. */
function lockOf(target: ConfigTarget | undefined, field: ConnectionField): ConnectionFieldSource | undefined {
    const source = target?.declared?.resolved.sources[field.key];

    return source?.kind === 'env' || source?.kind === 'code' ? source : undefined;
}

function isStored(field: ConnectionField, stored: ConnectionConfigView | undefined): boolean {
    if (!stored) {
        return false;
    }

    return field.kind === 'secret' ? stored.secretsSet.includes(field.key) : Object.hasOwn(stored.settings, field.key);
}

function sourceOf(target: ConfigTarget, field: ConnectionField, stored: ConnectionConfigView | undefined): ConnectionFieldSource {
    return lockOf(target, field) ?? (isStored(field, stored) ? { kind: 'store' } : { kind: 'unset' });
}

function isEditable(ctx: HttpContext, target: ConfigTarget): boolean {
    return ctx.connectionConfigs !== undefined && (target.declared?.editable ?? true);
}

function isDeletable(ctx: HttpContext, target: ConfigTarget): boolean {
    return ctx.connectionConfigs !== undefined && (target.declared?.deletable ?? target.definition.multiple);
}

/** Read from the store on every call: a provider's snapshot is the state of the last start. */
async function buildSettingsView(ctx: HttpContext, target: ConfigTarget): Promise<ConnectionSettingsView> {
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
    let state: ConnectionSettingsView['state'] = 'not_configured';

    if (hasValue) {
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

/** A setting's typed value, `null` for an empty one (unset), `undefined` when it does not fit the field. */
function normalizeSetting(field: ConnectionField, raw: unknown): ConnectionValue | null | undefined {
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

type FormInput = {
    settings?: Record<string, unknown>;
    set?: Record<string, unknown>;
    clear?: readonly string[];
};

/**
 * Turns a form into a store update, or throws a ValidupError with one issue
 * per field. Empty values are unset. Issues name known fields only and never
 * carry a value: a body may hold a secret anywhere.
 */
function toConfigUpdate(
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

    for (const key of clear) {
        secretField(key, ['secrets', 'clear', key]);
    }

    const newSettings = Object.fromEntries(settings);
    const newSecrets = Object.fromEntries(set);

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
function lockedValues(target: ConfigTarget): ConnectionValues {
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
function identityValues(target: ConfigTarget, settings: ConnectionConfigView['settings'] | undefined): ConnectionValues {
    return { ...settings as ConnectionValues | undefined, ...lockedValues(target) };
}

/** Refuses `values` when another connection of the type has their identity; `self` is the account being edited. */
async function assertUnique(ctx: HttpContext, definition: ConnectionTypeDefinition, values: ConnectionValues, self?: string): Promise<void> {
    if (!definition.uniqueId) {
        return;
    }

    const wanted = definition.uniqueId(values);
    const conflict = new ConflictError({ message: 'An account with the same identity already exists.' });
    const rows = await ctx.store.connections?.find() ?? [];
    const rowNames = new Set(rows.map((row) => row.name));
    const declaredNames = new Set<string>();

    for (const candidate of ctx.connectionTypes()) {
        if (candidate.definition.type !== definition.type) {
            continue;
        }

        for (const declared of candidate.connections()) {
            if (isDeleted(ctx, declared, rowNames.has(declared.name))) {
                continue;
            }

            declaredNames.add(declared.name);

            if (declared.name === self) {
                continue;
            }

            // a provider's list is the last start's: the store holds any edit since
            const stored = rowNames.has(declared.name) ? await ctx.connectionConfigs?.describe(declared.name) : undefined;
            const current = stored ?
                identityValues({ name: declared.name, definition, declared }, stored.settings) :
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
function assertSecretsRebound(target: ConfigTarget, stored: ConnectionConfigView | undefined, update: ConnectionConfigUpdate): void {
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

/**
 * `create` found the name taken: a row with no config is what a crash between
 * the row and its config leaves, so the typed values repair it; anything else
 * is a real clash.
 */
async function repairBareRow(ctx: HttpContext, name: string, type: string, update: ConnectionConfigUpdate): Promise<void> {
    const configs = requireConfigs(ctx);
    const row = await ctx.store.connections?.findOne(name);
    const stored = await configs.describe(name);
    const isBare = row?.type === type && stored?.revision === 0;

    if (!isBare) {
        throw new ConflictError({ message: `The connection "${name}" already exists.` });
    }

    await configs.update(name, update);
}

function serializeType(ctx: HttpContext, provider: IConnectionTypeProvider): ConnectionTypeView {
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

/**
 * Runs a test within TEST_TIMEOUT_MS on the clock: the test's signal aborts,
 * and a test that ignores it still ends here.
 */
async function runTest(
    ctx: HttpContext,
    test: NonNullable<ConnectionTypeDefinition['test']>,
    values: ConnectionValues,
    outer: AbortSignal,
): Promise<void> {
    const controller = new AbortController();
    let timer: { clear(): void } | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = ctx.clock.setTimeout(() => {
            const error = new ChamviError({ message: 'The connection test timed out.', code: ErrorCode.TIMEOUT });

            controller.abort(error);
            reject(error);
        }, TEST_TIMEOUT_MS);
    });

    try {
        await Promise.race([test(values, AbortSignal.any([outer, controller.signal])), deadline]);
    } finally {
        timer?.clear();
    }
}

/** Every failure's message is shown to an operator: only ours, with the saved secrets removed. */
function testFailureMessage(error: unknown, secrets: readonly string[]): string {
    if (!(error instanceof ChamviError)) {
        return 'The connection test failed.';
    }

    return secrets
        .filter((secret) => secret.length > 0)
        .reduce((message, secret) => message.replaceAll(secret, '[secret]'), error.message)
        .slice(0, TEST_MESSAGE_MAX_LENGTH);
}

/** What a listing shows of a connection's configuration: read from the store, as the form does. */
async function configurationOf(ctx: HttpContext, target: ConfigTarget): Promise<Pick<ConnectionView, 'state' | 'missing' | 'reason' | 'editable' | 'deletable'>> {
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
export async function listConnections(ctx: HttpContext): Promise<ConnectionView[]> {
    const views = new Map<string, ConnectionView>(ctx.connections().map((handle) => [handle.name, serializeConnection(handle)]));
    const declared = new Set<string>();
    const rows = ctx.connectionConfigs && ctx.connectionTypes().length > 0 ? await ctx.store.connections?.find() ?? [] : [];
    const rowNames = new Set(rows.map((row) => row.name));

    for (const provider of ctx.connectionTypes()) {
        for (const connection of provider.connections()) {
            if (isDeleted(ctx, connection, rowNames.has(connection.name))) {
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

/**
 * The configuration API: `GET /connection-types`, `POST
 * /connection-types/:type/connections`, `GET`/`PUT /connections/:name/config`,
 * `DELETE /connections/:name`, `POST /connections/:name/test` and
 * `GET /ui-pages`. Editing, deleting and testing need
 * `connection:<name>:write`; creating needs `connections:create`. A secret
 * never leaves: responses carry its name and whether it is set, and every
 * issue or message of these routes is free of submitted values.
 */
export function registerConnectionConfigRoutes(app: App, ctx: HttpContext): void {
    app.get('/connection-types', defineCoreHandler(async (event): Promise<{ data: ConnectionTypeView[] }> => {
        await authenticate(event, ctx);

        const seen = new Set<string>();
        const types: ConnectionTypeView[] = [];

        // a type with named instances may have one provider per module: the listing has one entry
        for (const provider of ctx.connectionTypes()) {
            if (!seen.has(provider.definition.type)) {
                seen.add(provider.definition.type);
                types.push(serializeType(ctx, provider));
            }
        }

        return { data: types };
    }));

    app.get('/ui-pages', defineCoreHandler(async (event): Promise<{ data: UiPage[] }> => {
        await authenticate(event, ctx);

        return {
            data: ctx.uiPages().map((page) => ({
                ...page,
                path: `${ctx.basePath}${page.path}`,
            })),
        };
    }));

    app.post('/connection-types/:type/connections', defineCoreHandler(async (event): Promise<ConnectionSettingsView & { name: string }> => {
        const principal = await authenticate(event, ctx);

        if (!hasPermission(principal.permissions, CONNECTIONS_CREATE_PERMISSION)) {
            throw new ForbiddenError({ message: `Missing permission "${CONNECTIONS_CREATE_PERMISSION}".` });
        }

        const type = param(event, 'type');
        const provider = ctx.connectionTypes().find((candidate) => candidate.definition.type === type);

        if (!provider) {
            throw new NotFoundError({ message: `The connection type "${type}" does not exist.` });
        }

        const { definition } = provider;
        const configs = requireConfigs(ctx);

        if (!definition.multiple || !provider.creatable()) {
            throw new ConflictError({ message: `Accounts of the type "${type}" cannot be added here.` });
        }

        const container = new Container<ConnectionCreateBody>();

        container.mount('account', isAccountId());
        container.mount('settings', isRecord());
        container.mount('secrets', { optional: true }, isRecord());

        const body = await validateBody(container, await readJsonBody(event, ctx.bodyLimit), { required: true });
        const name = storedConnectionName(type, body.account);

        assertConnectionName(name);

        if (await findDeclared(ctx, name)) {
            throw new ConflictError({ message: `The connection "${name}" already exists.` });
        }

        const update = toConfigUpdate(definition, { settings: body.settings, ...(body.secrets && { set: body.secrets }) }, undefined, undefined);

        await assertUnique(ctx, definition, { ...update.settings, ...update.secrets?.set } as ConnectionValues);
        await refuseWithoutKeyring(async () => {
            if (!await configs.create(name, type, update)) {
                await repairBareRow(ctx, name, type, update);
            }
        });

        event.response.status = 201;

        return { name, ...await buildSettingsView(ctx, { name, definition }) };
    }));

    app.get('/connections/:name/config', defineCoreHandler(async (event): Promise<ConnectionSettingsView> => {
        const target = await requireTarget(ctx, await authenticate(event, ctx), param(event, 'name'));

        event.response.headers.set('cache-control', 'private, no-store');

        return buildSettingsView(ctx, target);
    }));

    app.put('/connections/:name/config', defineCoreHandler(async (event): Promise<ConnectionSettingsView> => {
        const target = await requireTarget(ctx, await authenticate(event, ctx), param(event, 'name'), true);
        const configs = requireConfigs(ctx);

        if (!isEditable(ctx, target)) {
            throw new ConflictError({ message: `The connection "${target.name}" is set in code and cannot be edited here.` });
        }

        const container = new Container<ConnectionSaveBody>();

        container.mount('settings', { optional: true }, isRecord());
        container.mount('secrets', { optional: true }, isSecretsWrite());

        const body = await validateBody(container, await readJsonBody(event, ctx.bodyLimit), { required: true });
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
                await assertUnique(ctx, target.definition, after, target.name);
            }
        }

        await refuseWithoutKeyring(async () => {
            // a declared connection has no row until its first save; create leaves an existing one alone
            if (stored || !await configs.create(target.name, target.definition.type, update)) {
                await configs.update(target.name, update);
            }
        });

        event.response.headers.set('cache-control', 'private, no-store');

        return buildSettingsView(ctx, target);
    }));

    app.delete('/connections/:name', defineCoreHandler(async (event): Promise<{ restartRequired: boolean }> => {
        const principal = await authenticate(event, ctx);
        const target = await requireTarget(ctx, principal, param(event, 'name'), true);
        const configs = requireConfigs(ctx);

        if (!isDeletable(ctx, target)) {
            throw new ConflictError({ message: `The connection "${target.name}" is declared by a module or the environment and cannot be deleted.` });
        }

        await configs.delete(target.name, `http:${principal.id}`);

        return { restartRequired: target.declared !== undefined };
    }));

    app.post('/connections/:name/test', defineCoreHandler(async (event): Promise<ConnectionTestView> => {
        const target = await requireTarget(ctx, await authenticate(event, ctx), param(event, 'name'), true);
        const { definition } = target;

        if (!definition.test) {
            throw new NotFoundError({ message: `The connection type "${definition.type}" offers no test.` });
        }

        // only what is saved: the request body is never read
        const stored = await refuseWithoutKeyring(async () => ctx.connectionConfigs?.read(target.name));
        const values: ConnectionValues = { ...stored?.values, ...lockedValues(target) };
        const missing = definition.fields.filter((field) => field.required && !Object.hasOwn(values, field.key));

        if (missing.length > 0) {
            throw new ConflictError({ message: `Save ${missing.map((field) => field.label).join(', ')} first.` });
        }

        try {
            await runTest(ctx, definition.test, values, event.request.signal);

            return { ok: true };
        } catch (error) {
            const secrets = definition.fields
                .filter((field) => field.kind === 'secret')
                .map((field) => values[field.key])
                .filter((value): value is string => typeof value === 'string');

            return { ok: false, message: testFailureMessage(error, secrets) };
        }
    }));
}
