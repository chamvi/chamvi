/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionSettingsFieldView } from '@chamvi/core-kit';
import type { ConnectionStreamOptions, ConnectionTypeWire } from '@chamvi/http-kit';

/** The chip a status renders as: its words and one of the dashboard's status tones. */
export type ConnectionBadge = {
    label: string;
    tone: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
};

/** One field as the form draws it: its definition, what locks it, whether a secret has a value. */
export type ConnectionFormField = ConnectionTypeWire['fields'][number] & {
    /** Env or code sets it: the form shows where from and writes nothing. */
    lock?: Extract<ConnectionSettingsFieldView['source'], { kind: 'env' | 'code' }>;
    /** A secret with a stored value. The value itself never reaches the page. */
    secretSet: boolean;
};

/** The text of every control the form writes, by field key (plus `account` while adding); empty is unset. */
export type ConnectionFormValues = Record<string, string>;

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
    onCreated: (result: ConnectionCreated) => void;
    onDeleted: (result: ConnectionDeleted) => void;
};

export type ConnectionCreated = { name: string; restartRequired: boolean };

export type ConnectionDeleted = { name: string; restartRequired: boolean };

/** What the connections client needs of the app's API client. */
export type UseConnectionOptions = {
    /** The session is allowed `chamvi_connection_write` by name; widgets, the stream and reset also need the writer view of this connection. */
    write: boolean;
    sleep?: ConnectionStreamOptions['sleep'];
};
