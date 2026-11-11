/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { authup } from '@chamvi/http';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { AUTHENTICATOR_ORDER, AppToken, ModuleName } from '../module/constants.ts';
import { AUTHUP_MODULE_NAME } from './constants.ts';
import { createAuthupRemote } from './remote.ts';
import type { AuthupModuleOptions } from './types.ts';

/**
 * Contributes the authup authenticator (after static tokens), over
 * `options.verifier`, `options.catalog` and `options.realm`, or what the
 * authup server of the env serves for each one not given. Catalog and realm
 * failures go to the app logger; that login then grants nothing.
 */
export class AuthupModule implements IModule {
    readonly name: string = AUTHUP_MODULE_NAME;

    readonly dependencies = [ModuleName.CONFIG];

    readonly verifier: ITokenVerifier;

    protected catalog: () => Promise<unknown>;

    protected realm: () => Promise<string>;

    constructor(options: AuthupModuleOptions = {}) {
        const { realm } = options;

        if (typeof realm !== 'undefined' && (typeof realm !== 'string' || realm.length === 0)) {
            throw new InvalidAgentDefinitionError('authup: realm must be a non-empty string.');
        }

        // env is read only for what is not given, and then now
        let remote: ReturnType<typeof createAuthupRemote> | undefined;
        const server = () => {
            remote ??= createAuthupRemote(options);

            return remote;
        };

        this.verifier = options.verifier ?? server().verifier();
        this.catalog = options.catalog ?? server().catalog;
        this.realm = typeof realm === 'undefined' ? server().realm : async () => realm;
    }

    async setup(container: IContainer): Promise<void> {
        const logger = container.resolve(AppToken.LOGGER);

        container.registerMany(AppToken.AUTHENTICATORS, {
            useValue: {
                name: 'authup',
                order: AUTHENTICATOR_ORDER.AUTHUP,
                authenticator: authup({
                    verifier: this.verifier,
                    catalog: this.catalog,
                    realm: this.realm,
                    clock: container.resolve(AppToken.CLOCK),
                    onError: (error) => logger.error('authup error', error),
                }),
            },
        });
    }
}

/**
 * The authup module. Unless `verifier`, `catalog` and `realm` are all given
 * it reads `AUTHUP_URL`, `AUTHUP_CLIENT_ID` and `AUTHUP_CLIENT_SECRET` (all
 * required) from `options.env ?? process.env` now; options win.
 */
export function authupModule(options?: AuthupModuleOptions): IModule {
    return new AuthupModule(options);
}
