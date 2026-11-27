/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionTypeDefinition, DeclaredConnection, IConnectionHandle } from '@chamvi/core';
import type {
    ConnectionCreateBody,
    ConnectionDetailView,
    ConnectionSaveBody,
    ConnectionSettingsView,
    ConnectionTestView,
    ConnectionTypeView,
    ConnectionView,
    UiPage,
} from '@chamvi/core-kit';
import type { HttpContext } from '../app/types.ts';
import type { Principal } from '../auth/types.ts';











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
/** What `ConnectionHttpService` needs of the http context. */
export type ConnectionHttpServiceContext = Pick<HttpContext, 'connections' | 'connectionTypes' | 'connectionConfigs' | 'connectionService' | 'clock' | 'onError'>;

/**
 * The connection handles joined with what is declared and stored.
 * `chamvi_connection_read` for a connection's `{ name, type }` lists and
 * shows it, `chamvi_connection_write` (which implies read) also sees its
 * widgets (a pairing QR), streams it and resets it; the check runs before
 * the 404, so a refusal says nothing about the name.
 */
export interface IConnectionHttpService {
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
export type ConnectionConfigServiceContext = ConnectionHttpServiceContext & Pick<HttpContext, 'uiPages' | 'basePath'>;

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
    service: IConnectionHttpService;
    config: IConnectionConfigService;
};

export type ConnectionConfigControllerContext = {
    config: IConnectionConfigService;
};

// #endregion services
