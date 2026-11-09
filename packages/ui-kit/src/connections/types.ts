/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionStatus, ConnectionWidget } from '@chamvi/core';
import type {
    ConnectionCreateBody,
    ConnectionDetailView,
    ConnectionSaveBody,
    ConnectionSettingsFieldView,
    ConnectionSettingsView,
    ConnectionTestView,
    ConnectionTypeView,
    ConnectionView,
} from '@chamvi/http';
import type { ApiError } from '../api/error.ts';
import type { IApiClient } from '../api/types.ts';

export type ConnectionWire = ConnectionView;

/** `GET /connections/:name`: `widgets` only for a holder of `connection:<name>:write`. */
export type ConnectionDetailWire = ConnectionDetailView;

export type ConnectionWidgetWire = ConnectionWidget;

/** One entry of `GET /connection-types`. */
export type ConnectionTypeWire = ConnectionTypeView;

/** `GET /connections/:name/config`: a secret only ever as a `set` flag. */
export type ConnectionSettingsWire = ConnectionSettingsView;

export type ConnectionTestWire = ConnectionTestView;

/** The chip a status renders as: its words and one of the dashboard's status tones. */
export type ConnectionBadge = {
    label: string;
    tone: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
};

/** The `/connections` routes; `stream` answers the raw SSE response. */
export interface IConnectionsApi {
    list(): Promise<ConnectionWire[]>;
    get(name: string): Promise<ConnectionDetailWire>;
    reset(name: string): Promise<ConnectionWire>;
    stream(name: string, signal: AbortSignal): Promise<Response>;
}

/** The configuration routes: types, an account's settings, create, save, delete and test. */
export interface IConnectionConfigApi {
    types(): Promise<ConnectionTypeWire[]>;
    read(name: string): Promise<ConnectionSettingsWire>;
    create(type: string, body: ConnectionCreateBody): Promise<ConnectionSettingsWire & { name: string }>;
    save(name: string, body: ConnectionSaveBody): Promise<ConnectionSettingsWire>;
    remove(name: string): Promise<{ restartRequired: boolean }>;
    test(name: string): Promise<ConnectionTestWire>;
}

/** One field as the form draws it: its definition, what locks it, whether a secret has a value. */
export type ConnectionFormField = ConnectionTypeWire['fields'][number] & {
    /** Env or code sets it: the form shows where from and writes nothing. */
    lock?: Extract<ConnectionSettingsFieldView['source'], { kind: 'env' | 'code' }>;
    /** A secret with a stored value. The value itself never reaches the page. */
    secretSet: boolean;
};

/** The open in-page confirmation of the form, at most one. */
export type ConnectionFormConfirmation = { kind: 'delete' } | {
    kind: 'clear'; 
    key: string; 
    label: string; 
    stopsNextStart: boolean 
};

export type UseConnectionFormOptions = {
    /** Absent while adding an account. */
    name?: string;
    type: string;
    onCreated: (name: string) => void;
    onDeleted: (result: ConnectionDeleted) => void;
};

export type ConnectionDeleted = { name: string; restartRequired: boolean };

/** What the connections client needs of the app's API client. */
export type ConnectionsTransport = Pick<IApiClient, 'send'>;

export type ConnectionStreamEvent = { type: 'status'; status: ConnectionStatus } |
    { type: 'widgets'; widgets: ConnectionWidgetWire[] };

export type ConnectionStreamOptions = {
    api: IConnectionsApi;
    name: string;
    onEvent: (event: ConnectionStreamEvent) => void;
    /** A 400, 401, 403 or 404: no reconnect. */
    onError?: (error: ApiError) => void;
    /** Waits between reconnects; resolves early when the signal aborts. */
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

export interface IConnectionStream {
    close(): void;
}

export type UseConnectionOptions = {
    /** The principal holds `connection:<name>:write`: widgets, the live stream and reset. */
    write: boolean;
    sleep?: ConnectionStreamOptions['sleep'];
};
