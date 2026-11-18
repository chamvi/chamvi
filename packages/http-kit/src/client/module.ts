/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Client as BaseClient } from 'hapic';
import {
    AccountAPI,
    AgentAPI,
    ArtifactAPI,
    AuthorizationAPI,
    ComponentAPI,
    ConnectionAPI,
    ConnectionTypeAPI,
    RunAPI,
    ScheduleAPI,
    StateAPI,
    UiPageAPI,
} from '../domains/index.ts';
import { REQUEST_TIMEOUT_MS } from '../error/constants.ts';
import type { ClientOptions, IClient } from './types.ts';

/** The chamvi API client (`baseURL` = the API base): hapic plus one API per domain, `client.run.getMany()`. */
export class Client extends BaseClient implements IClient {
    readonly timeoutMs: number;

    readonly account: AccountAPI;

    readonly agent: AgentAPI;

    readonly artifact: ArtifactAPI;

    readonly authorization: AuthorizationAPI;

    readonly component: ComponentAPI;

    readonly connection: ConnectionAPI;

    readonly connectionType: ConnectionTypeAPI;

    readonly run: RunAPI;

    readonly schedule: ScheduleAPI;

    readonly state: StateAPI;

    readonly uiPage: UiPageAPI;

    constructor(options: ClientOptions = {}) {
        const { timeoutMs, ...rest } = options;

        super(rest);

        this.timeoutMs = timeoutMs ?? REQUEST_TIMEOUT_MS;

        if (!this.getHeader('accept')) {
            this.setHeader('accept', 'application/json');
        }

        this.account = new AccountAPI({ client: this });
        this.agent = new AgentAPI({ client: this });
        this.artifact = new ArtifactAPI({ client: this });
        this.authorization = new AuthorizationAPI({ client: this });
        this.component = new ComponentAPI({ client: this });
        this.connection = new ConnectionAPI({ client: this });
        this.connectionType = new ConnectionTypeAPI({ client: this });
        this.run = new RunAPI({ client: this });
        this.schedule = new ScheduleAPI({ client: this });
        this.state = new StateAPI({ client: this });
        this.uiPage = new UiPageAPI({ client: this });
    }
}
