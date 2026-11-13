/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ConnectionFieldKind,
    ConnectionFieldSource,
    ConnectionState,
    ConnectionStatus,
    ConnectionTypeDefinition,
    ConnectionWidget,
    DeclaredConnection,
    IConnectionHandle,
} from '@chamvi/core';
import type { HttpContext } from '../app/types.ts';
import type { Principal } from '../auth/types.ts';
import type { UiPage } from '../static/types.ts';

/**
 * One entry of `GET /connections` (never widgets): the handles and the
 * declared connections. `status` is `disconnected` for a connection with no
 * handle in this process (`live: false`, which is no failure); the
 * configuration fields only come with a type.
 */
export type ConnectionView = {
    name: string;
    type: string;
    status: ConnectionStatus;
    /** The account id tools and variables use, for a multi-instance type. */
    account?: string;
    state?: ConnectionState;
    /** The labels of the required fields without a value, when `state` is `incomplete`. */
    missing?: string[];
    /** Why the last start could not use it, when known: names options or variables, never a value. */
    reason?: string;
    /** `false`: no handle runs in this process, so `status` says nothing about the connection. */
    live?: boolean;
    editable?: boolean;
    deletable?: boolean;
};

/** `GET /connections/{name}`: `widgets`, `canReset` and `live: true` only for a holder of `chamvi_connection_write` for it. */
export type ConnectionDetailView = ConnectionView & {
    widgets?: ConnectionWidget[];
    /** The connection offers a reset (`POST /connections/{name}/reset` does not answer 404). */
    canReset?: boolean;
};

/** A field of `GET /connection-types`: what a form needs. */
export type ConnectionTypeFieldView = {
    key: string;
    label: string;
    kind: ConnectionFieldKind;
    required?: boolean;
    description?: string;
    options?: readonly string[];
    multiline?: boolean;
    /** Changing it needs every secret of the connection again. */
    bindsSecrets?: boolean;
};

/** One entry of `GET /connection-types`. */
export type ConnectionTypeView = {
    type: string;
    label: string;
    multiple: boolean;
    /** Accounts of the type can be added from the dashboard now. */
    creatable: boolean;
    /** `POST /connections/{name}/test` does not answer 404. */
    testable: boolean;
    fields: ConnectionTypeFieldView[];
};

export type ConnectionSettingsFieldView = {
    key: string;
    source: ConnectionFieldSource;
    /** Only on a secret: whether it has a value. Never the value. */
    set?: boolean;
};

/**
 * `GET /connections/{name}/config`. `settings` holds stored plain values only:
 * never a secret, and never a field locked by env or code.
 */
export type ConnectionSettingsView = {
    type: string;
    state: ConnectionState;
    /** The labels of the required fields without a value, when `state` is `incomplete`. */
    missing?: string[];
    /** Why the last start could not use it, when known and no save is waiting for a restart. */
    reason?: string;
    settings: Record<string, unknown>;
    fields: ConnectionSettingsFieldView[];
    /** The stored revision is not the one this process loaded. */
    restartRequired: boolean;
    editable: boolean;
    deletable: boolean;
};

/** `POST /connections/{name}/test`; `message` never carries a secret. */
export type ConnectionTestView = {
    ok: boolean;
    message?: string;
};

/** Secret values by field name; `''` or `null` keeps the stored value. */
export type ConnectionSecretValues = Record<string, string | null>;

/** `PUT /connections/{name}/config`. An empty value is unset. */
export type ConnectionSaveBody = {
    /** The complete settings: replaces the stored ones. Absent keeps them. */
    settings?: Record<string, unknown>;
    secrets?: {
        set?: ConnectionSecretValues;
        clear?: string[];
    };
};

/** `POST /connection-types/{type}/connections`; `secrets` by field name. */
export type ConnectionCreateBody = {
    account: string;
    settings: Record<string, unknown>;
    secrets?: ConnectionSecretValues;
};

// #region helpers
/** What a configuration request addresses: a declared connection, or a stored account no process loaded yet. */
export type ConfigTarget = {
    name: string;
    definition: ConnectionTypeDefinition;
    declared?: DeclaredConnection;
};

/** A form `toConfigUpdate` turns into a store update. */
export type FormInput = {
    settings?: Record<string, unknown>;
    set?: Record<string, unknown>;
    clear?: readonly string[];
};

// #endregion helpers

// #region services
/** What `ConnectionService` needs of the http context. */
export type ConnectionServiceContext = Pick<HttpContext, 'connections' | 'connectionTypes' | 'connectionConfigs' | 'store' | 'clock' | 'onError'>;

/**
 * The connection handles joined with what is declared and stored.
 * `chamvi_connection_read` for a connection's `{ name, type }` lists and
 * shows it, `chamvi_connection_write` (which implies read) also sees its
 * widgets (a pairing QR), streams it and resets it; the check runs before
 * the 404, so a refusal says nothing about the name.
 */
export interface IConnectionService {
    /** The connections the principal may read; never widgets. */
    list(principal: Principal): Promise<{ data: ConnectionView[] }>;
    /** 403, then 404; a writer also gets the widgets, `canReset` and `live`. */
    get(name: string, principal: Principal): Promise<ConnectionDetailView>;
    /** The handle of `name` the principal may write (403, then 404). */
    requireWritable(name: string, principal: Principal): Promise<IConnectionHandle>;
    /**
     * Starts the handle's reset (its rejection goes to `onError`): 404
     * without one, 409 while the connection is `held_elsewhere`.
     */
    reset(name: string, principal: Principal): Promise<ConnectionView>;
}

/** What `ConnectionConfigService` needs of the http context. */
export type ConnectionConfigServiceContext = ConnectionServiceContext & Pick<HttpContext, 'uiPages' | 'basePath'>;

/**
 * The configuration API. Editing, deleting and testing need
 * `chamvi_connection_write` for the connection's `{ name, type }`, checked
 * on the looked-up target before its 404; creating needs
 * `chamvi_connection_create` for `{ type }`. A secret never leaves:
 * responses carry its name and whether it is set, and every issue or
 * message is free of submitted values.
 */
export interface IConnectionConfigService {
    types(principal: Principal): Promise<{ data: ConnectionTypeView[] }>;
    uiPages(principal: Principal): Promise<{ data: UiPage[] }>;
    /** `data` is untrusted, validated here. */
    create(type: string, data: ConnectionCreateBody, principal: Principal): Promise<ConnectionSettingsView & { name: string }>;
    read(name: string, principal: Principal): Promise<ConnectionSettingsView>;
    /** `data` is untrusted, validated here. */
    update(name: string, data: ConnectionSaveBody, principal: Principal): Promise<ConnectionSettingsView>;
    delete(name: string, principal: Principal): Promise<{ restartRequired: boolean }>;
    /** Saved values only, bounded by `signal` and a deadline on the clock. */
    test(name: string, signal: AbortSignal, principal: Principal): Promise<ConnectionTestView>;
}

export type ConnectionControllerContext = {
    service: IConnectionService;
    config: IConnectionConfigService;
};

export type ConnectionConfigControllerContext = {
    config: IConnectionConfigService;
};

// #endregion services
