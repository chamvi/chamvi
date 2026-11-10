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
    ConnectionWidget,
} from '@chamvi/core';

/**
 * One entry of `GET /connections` (never widgets): the handles and the
 * declared connections. `status` is `disconnected` for a connection with no
 * handle in this process; the configuration fields only come with a type.
 */
export type ConnectionView = {
    name: string;
    type: string;
    status: ConnectionStatus;
    /** The account id tools and variables use, for a multi-instance type. */
    account?: string;
    state?: ConnectionState;
    editable?: boolean;
    deletable?: boolean;
};

/** `GET /connections/:name`: `widgets` and `canReset` only for a holder of `connection:<name>:write`. */
export type ConnectionDetailView = ConnectionView & {
    widgets?: ConnectionWidget[];
    /** The connection offers a reset (`POST /connections/:name/reset` does not answer 404). */
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
};

/** One entry of `GET /connection-types`. */
export type ConnectionTypeView = {
    type: string;
    label: string;
    multiple: boolean;
    /** Accounts of the type can be added from the dashboard now. */
    creatable: boolean;
    /** `POST /connections/:name/test` does not answer 404. */
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
 * `GET /connections/:name/config`. `settings` holds stored plain values only:
 * never a secret, and never a field locked by env or code.
 */
export type ConnectionSettingsView = {
    type: string;
    state: ConnectionState;
    settings: Record<string, unknown>;
    fields: ConnectionSettingsFieldView[];
    /** The stored revision is not the one this process loaded. */
    restartRequired: boolean;
    editable: boolean;
    deletable: boolean;
};

/** `POST /connections/:name/test`; `message` never carries a secret. */
export type ConnectionTestView = {
    ok: boolean;
    message?: string;
};

/** `PUT /connections/:name/config`. An empty value is unset. */
export type ConnectionSaveBody = {
    /** The complete settings: replaces the stored ones. Absent keeps them. */
    settings?: Record<string, unknown>;
    secrets?: {
        set?: Record<string, unknown>;
        clear?: string[];
    };
};

/** `POST /connection-types/:type/connections`; `secrets` by field name. */
export type ConnectionCreateBody = {
    account: string;
    settings: Record<string, unknown>;
    secrets?: Record<string, unknown>;
};
