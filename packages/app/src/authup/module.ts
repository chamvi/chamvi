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
import type { IModule, ModuleDependency } from 'orkos';
import { isObject } from 'smob';
import { AUTHENTICATOR_ORDER, AppToken, ModuleName } from '../module/constants.ts';
import { TIMER_MAX_MS } from '../env/constants.ts';
import { envInteger, envString } from '../env/module.ts';
import type { Env } from '../env/types.ts';
import { AUTHUP_MODULE_NAME, AUTHUP_TIMEOUT_MS_DEFAULT } from './constants.ts';
import { boundVerifier, withDeadline } from './deadline.ts';
import { createAuthupRemote, isClientId, once } from './remote.ts';
import type { AuthupModuleOptions, AuthupPermissionOwner } from './types.ts';

/**
 * Contributes the authup authenticator (after static tokens), over
 * `options.verifier`, `options.catalog` and `options.realm`, or what the
 * authup server of the env serves for each one not given. Catalog and realm
 * failures go to the app logger; that login then grants nothing. With the
 * permission owner `client`, the dashboard client (`UI_AUTH` of the dashboard
 * module, which sets up first, else `CHAMVI_UI_AUTHUP_CLIENT_ID`) owns the
 * permissions: resolved in `setup()` of a serving start, so one that does not
 * resolve fails the start, never falling back to the realm's definitions.
 * Other modes (job, migrate, a check) resolve it at the first login with
 * grants, which then grants nothing until it resolves.
 */
export class AuthupModule implements IModule {
    readonly name: string = AUTHUP_MODULE_NAME;

    readonly dependencies: (string | ModuleDependency)[] = [
        ModuleName.CONFIG,
        // the dashboard registers UI_AUTH, the owner client in client mode
        { name: ModuleName.UI, optional: true },
    ];

    readonly verifier: ITokenVerifier;

    protected catalog: () => Promise<unknown>;

    protected realm: () => Promise<string>;

    /** Whether `realm` is the remote lookup (bounded and shared in `setup()`), not a given realm. */
    protected realmLookup: boolean;

    protected timeoutMs: number;

    /** Who owns the permissions: `client` makes the dashboard client the owner. */
    protected permissionOwner: AuthupPermissionOwner;

    protected env: Env;

    /** The authup server of the env, created on first use. */
    protected server: () => ReturnType<typeof createAuthupRemote>;

    constructor(options: AuthupModuleOptions = {}) {
        const { realm } = options;

        if (typeof realm !== 'undefined' && (typeof realm !== 'string' || realm.length === 0)) {
            throw new InvalidAgentDefinitionError('authup: realm must be a non-empty string.');
        }

        const env = options.env ?? process.env;
        const permissionOwner: unknown = options.permissionOwner ?? envString(env, 'AUTHUP_PERMISSION_OWNER') ?? 'realm';

        if (permissionOwner !== 'realm' && permissionOwner !== 'client') {
            throw new InvalidAgentDefinitionError('authup: the permission owner (AUTHUP_PERMISSION_OWNER) must be realm or client.');
        }

        this.permissionOwner = permissionOwner;
        this.env = env;

        const timeoutMs = options.timeoutMs ??
            envInteger(env, 'AUTHUP_TIMEOUT_MS', { min: 1, max: TIMER_MAX_MS }) ??
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

        this.server = server;

        this.verifier = options.verifier ?? server().verifier();
        this.catalog = options.catalog ?? server().catalog;
        this.realm = typeof realm === 'undefined' ? server().realm : async () => realm;
        this.realmLookup = typeof realm === 'undefined';
    }

    async setup(container: IContainer): Promise<void> {
        const logger = container.resolve(AppToken.LOGGER);
        const clock = container.resolve(AppToken.CLOCK);
        const { timeoutMs } = this;
        const { catalog, realm } = this;
        // the bound sits inside once: a timed-out lookup is forgotten and the next login looks up again
        const bounded = this.realmLookup ? once(() => withDeadline(clock, timeoutMs, 'realm lookup', realm)) : realm;
        const context = container.resolve(AppToken.CONTEXT);
        const ownerClient = this.permissionOwner === 'client' ? this.readOwnerClient(container) : undefined;
        // one lookup, kept once it resolved; serving apps resolve it now, so one that does not resolve fails the start
        const owner = ownerClient ? once(() => this.resolvePermissionClient(ownerClient, bounded, clock)) : undefined;

        if (owner && context.mode === 'start' && !context.check) {
            await owner();
        }

        container.registerMany(AppToken.AUTHENTICATORS, {
            useValue: {
                name: 'authup',
                order: AUTHENTICATOR_ORDER.AUTHUP,
                authenticator: authup({
                    verifier: boundVerifier(this.verifier, clock, timeoutMs),
                    catalog: () => withDeadline(clock, timeoutMs, 'catalog read', catalog),
                    realm: bounded,
                    ...(owner ? { client: owner } : {}),
                    clock,
                    onError: (error) => logger.error('authup error', error),
                }),
            },
        });
    }

    /** The dashboard client, an id or a name: the dashboard module's `UI_AUTH`, else `CHAMVI_UI_AUTHUP_CLIENT_ID`. */
    protected readOwnerClient(container: IContainer): string {
        // only the client id is needed here: the env fallback does not require the dashboard's AUTHUP_URL
        const clientId = container.has(AppToken.UI_AUTH) ?
            container.resolve(AppToken.UI_AUTH).authup?.clientId :
            envString(this.env, 'CHAMVI_UI_AUTHUP_CLIENT_ID');

        if (typeof clientId !== 'string' || clientId.length === 0) {
            throw new InvalidAgentDefinitionError(
                'authup: the permission owner client needs the dashboard client (CHAMVI_UI_AUTHUP_CLIENT_ID).',
            );
        }

        return clientId;
    }

    /** The owner client's id: an id as is, a name looked up in chamvi's realm under the deadline. */
    protected async resolvePermissionClient(name: string, realm: () => Promise<string>, clock: IClock): Promise<string> {
        if (isClientId(name)) {
            return name;
        }

        try {
            const { client: lookup } = this.server();
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
 * and no owner client name is looked up, it reads `AUTHUP_URL`,
 * `AUTHUP_CLIENT_ID` and `AUTHUP_CLIENT_SECRET` (all required) from
 * `options.env ?? process.env` now; options win.
 */
export function authupModule(options?: AuthupModuleOptions): IModule {
    return new AuthupModule(options);
}
