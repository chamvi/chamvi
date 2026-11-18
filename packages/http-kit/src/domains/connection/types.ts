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
    ConnectionSettingsView,
    ConnectionTestView,
    ConnectionView,
} from '@chamvi/http';
import type { ApiError } from '../../error/module.ts';
import type { APIRequestOptions } from '../types.ts';

export type ConnectionWire = ConnectionView;

/** `GET /connections/:name`: `widgets` only for a holder of `chamvi_connection_write` for it. */
export type ConnectionDetailWire = ConnectionDetailView;

export type ConnectionWidgetWire = ConnectionWidget;

/** `GET /connections/:name/config`: a secret only ever as a `set` flag. */
export type ConnectionSettingsWire = ConnectionSettingsView;

export type ConnectionTestWire = ConnectionTestView;

/** The `/connections` routes, an account's configuration among them; a secret travels only in a request body. */
export interface IConnectionAPI {
    getMany(options?: APIRequestOptions): Promise<ConnectionWire[]>;
    getOne(name: string, options?: APIRequestOptions): Promise<ConnectionDetailWire>;
    reset(name: string, options?: APIRequestOptions): Promise<ConnectionWire>;
    /** The `text/event-stream` body of `GET /connections/:name/events`. */
    stream(name: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
    getConfig(name: string, options?: APIRequestOptions): Promise<ConnectionSettingsWire>;
    /** `POST /connection-types/:type/connections`. */
    create(type: string, body: ConnectionCreateBody, options?: APIRequestOptions): Promise<ConnectionSettingsWire & { name: string }>;
    /** `PUT /connections/:name/config`. */
    save(name: string, body: ConnectionSaveBody, options?: APIRequestOptions): Promise<ConnectionSettingsWire>;
    delete(name: string, options?: APIRequestOptions): Promise<{ restartRequired: boolean }>;
    test(name: string, options?: APIRequestOptions): Promise<ConnectionTestWire>;
}

export type ConnectionStreamEvent = { type: 'status'; status: ConnectionStatus } |
    { type: 'widgets'; widgets: ConnectionWidgetWire[] };

export type ConnectionStreamOptions = {
    api: Pick<IConnectionAPI, 'stream'>;
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
