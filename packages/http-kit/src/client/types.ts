/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ClientOptionsInput, IClient as IBaseClient } from 'hapic';
import type {
    IAccountAPI,
    IAgentAPI,
    IArtifactAPI,
    IAuthorizationAPI,
    IComponentAPI,
    IConnectionAPI,
    IConnectionTypeAPI,
    IRunAPI,
    IScheduleAPI,
    IStateAPI,
    IUiPageAPI,
} from '../domains/index.ts';
import type { ClientAuthenticationHookOptions } from '../hook/types.ts';

export type ClientOptions = ClientOptionsInput & {
    /** How long a request waits for the answer before it fails as a `timeout` `ApiError`. Default `REQUEST_TIMEOUT_MS`. */
    timeoutMs?: number;
};

/** `createClient()`: a client with the authentication hook attached. */
export type CreateClientOptions = ClientOptions & ClientAuthenticationHookOptions;

/** The chamvi API client: hapic's request surface plus one API per domain. */
export interface IClient extends IBaseClient {
    readonly timeoutMs: number;
    readonly account: IAccountAPI;
    readonly agent: IAgentAPI;
    readonly artifact: IArtifactAPI;
    readonly authorization: IAuthorizationAPI;
    readonly component: IComponentAPI;
    readonly connection: IConnectionAPI;
    readonly connectionType: IConnectionTypeAPI;
    readonly run: IRunAPI;
    readonly schedule: IScheduleAPI;
    readonly state: IStateAPI;
    readonly uiPage: IUiPageAPI;
}
