/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import { ErrorCode, InvalidAgentDefinitionError } from '@chamvi/core';
import type { IClock } from '@chamvi/core';
import { authup } from '@chamvi/http';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { isObject } from 'smob';
import { AUTHENTICATOR_ORDER, AppToken, ModuleName } from '../module/constants.ts';
import { TIMER_MAX_MS } from '../env/constants.ts';
import { envInteger, envString } from '../env/module.ts';
import { AUTHUP_MODULE_NAME, AUTHUP_TIMEOUT_MS_DEFAULT } from './constants.ts';
import { boundVerifier, withDeadline } from './deadline.ts';
import { createAuthupRemote, isClientId, once } from './remote.ts';
import type { AuthupModuleOptions } from './types.ts';

/**
 * Contributes the authup authenticator (after static tokens), over
 * `options.verifier`, `options.catalog` and `options.realm`, or what the
 * authup server of the env serves for each one not given. Catalog and realm
 * failures go to the app logger; that login then grants nothing. A
 * permission client is resolved in `setup()`: one that does not resolve
 * fails the start, never falling back to the realm's definitions.
 */
export class AuthupModule implements IModule {
    readonly name: string = AUTHUP_MODULE_NAME;

    readonly dependencies = [ModuleName.CONFIG];

    readonly verifier: ITokenVerifier;

    protected catalog: () => Promise<unknown>;

    protected realm: () => Promise<string>;

    /** Whether `realm` is the remote lookup (bounded and shared in `setup()`), not a given realm. */
    protected realmLookup: boolean;

    protected timeoutMs: number;

    /** The configured owner client, an id or a name; undefined in realm mode. */
    protected permissionClient: string | undefined;

    /** Resolves a client name in a realm; set only when `permissionClient` is a name. */
    protected clientLookup: ((name: string, realm: string) => Promise<string>) | undefined;

    constructor(options: AuthupModuleOptions = {}) {
        const { realm } = options;

        if (typeof realm !== 'undefined' && (typeof realm !== 'string' || realm.length === 0)) {
            throw new InvalidAgentDefinitionError('authup: realm must be a non-empty string.');
        }

        if (typeof options.permissionClient !== 'undefined' &&
            (typeof options.permissionClient !== 'string' || options.permissionClient.length === 0)) {
            throw new InvalidAgentDefinitionError('authup: permissionClient must be a non-empty string.');
        }

        const timeoutMs = options.timeoutMs ??
            envInteger(options.env ?? process.env, 'AUTHUP_TIMEOUT_MS', { min: 1, max: TIMER_MAX_MS }) ??
            AUTHUP_TIMEOUT_MS_DEFAULT;

        if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new InvalidAgentDefinitionError('authup: timeoutMs must be a positive finite number.');
        }

        if (timeoutMs > TIMER_MAX_MS) {
            throw new InvalidAgentDefinitionError(`authup: timeoutMs must be at most ${TIMER_MAX_MS}.`);
        }

        this.timeoutMs = timeoutMs;

        // env is read only for what is not given, and then now
        let remote: ReturnType<typeof createAuthupRemote> | undefined;
        const server = () => {
            remote ??= createAuthupRemote(options);

            return remote;
        };

        this.verifier = options.verifier ?? server().verifier();
        this.catalog = options.catalog ?? server().catalog;
        this.realm = typeof realm === 'undefined' ? server().realm : async () => realm;
        this.realmLookup = typeof realm === 'undefined';
        this.permissionClient = options.permissionClient ??
            envString(options.env ?? process.env, 'AUTHUP_PERMISSION_CLIENT');
        this.clientLookup = this.permissionClient && !isClientId(this.permissionClient) ?
            server().client :
            undefined;
    }

    async setup(container: IContainer): Promise<void> {
        const logger = container.resolve(AppToken.LOGGER);
        const clock = container.resolve(AppToken.CLOCK);
        const { timeoutMs } = this;
        const { catalog, realm } = this;
        // the bound sits inside once: a timed-out lookup is forgotten and the next login looks up again
        const bounded = this.realmLookup ? once(() => withDeadline(clock, timeoutMs, 'realm lookup', realm)) : realm;
        const owner = await this.resolvePermissionClient(bounded, clock);

        container.registerMany(AppToken.AUTHENTICATORS, {
            useValue: {
                name: 'authup',
                order: AUTHENTICATOR_ORDER.AUTHUP,
                authenticator: authup({
                    verifier: boundVerifier(this.verifier, clock, timeoutMs),
                    catalog: () => withDeadline(clock, timeoutMs, 'catalog read', catalog),
                    realm: bounded,
                    ...(owner ? { client: async () => owner } : {}),
                    clock,
                    onError: (error) => logger.error('authup error', error),
                }),
            },
        });
    }

    /** The owner client's id: an id as is, a name looked up once in chamvi's realm; undefined without one. */
    protected async resolvePermissionClient(realm: () => Promise<string>, clock: IClock): Promise<string | undefined> {
        const name = this.permissionClient;
        const lookup = this.clientLookup;

        if (!name || !lookup) {
            return name;
        }

        try {
            const realmId = await realm();

            return await withDeadline(clock, this.timeoutMs, 'permission client lookup', () => lookup(name, realmId));
        } catch (error) {
            if (isObject(error) && error.code === ErrorCode.INVALID_AGENT_DEFINITION) {
                throw error;
            }

            const reason = Error.isError(error) ? error.message : String(error);

            throw new InvalidAgentDefinitionError(`authup: the permission client "${name}" could not be resolved: ${reason}`);
        }
    }
}

/**
 * The authup module. Unless `verifier`, `catalog` and `realm` are all given
 * and the permission client is no name, it reads `AUTHUP_URL`,
 * `AUTHUP_CLIENT_ID` and `AUTHUP_CLIENT_SECRET` (all required) from
 * `options.env ?? process.env` now; options win.
 */
export function authupModule(options?: AuthupModuleOptions): IModule {
    return new AuthupModule(options);
}
