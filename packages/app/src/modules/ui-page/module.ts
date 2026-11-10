/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { buildCsp, staticRoutes } from '@chamvi/http';
import type { StaticCspConfig } from '@chamvi/http';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { envString, envUrl } from '../../env/module.ts';
import type { Env } from '../../env/types.ts';
import { AppToken } from '../../module/constants.ts';
import type { UiPageModuleOptions } from './types.ts';

const DEFAULT_UI_BASE = '/ui';

/** The dashboard's sign-in, as `uiModule()` reads it: a page shares its session, so its CSP must let the authup refresh through. */
function readPageAuth(env: Env) {
    const clientId = envString(env, 'CHAMVI_UI_AUTHUP_CLIENT_ID');

    if (typeof clientId === 'undefined') {
        return { tokens: true };
    }

    const realmId = envString(env, 'CHAMVI_UI_AUTHUP_REALM_ID');

    return {
        tokens: true,
        authup: {
            url: envUrl(env, 'AUTHUP_URL', { required: true, protocols: ['http:', 'https:'] }),
            clientId,
            ...(typeof realmId === 'string' && { realmId }),
        },
    };
}

/**
 * Serves a prebuilt `*-ui` page at `<uiBase>/ext/<slug>` (`HTTP_ROUTES`) and
 * registers it with the shell (`UI_PAGES`).
 */
export class UiPageModule implements IModule {
    readonly name: string;

    protected options: UiPageModuleOptions;

    constructor(options: UiPageModuleOptions) {
        this.options = options;
        this.name = options.name;
    }

    async setup(container: IContainer): Promise<void> {
        const {
            label,
            types,
            slug,
            root,
        } = this.options;
        const uiBase = this.options.uiBase ?? DEFAULT_UI_BASE;
        const path = `${uiBase}/ext/${slug}`;
        const auth = readPageAuth(container.resolve(AppToken.CONTEXT).env);

        for (const route of staticRoutes({
            path,
            root,
            config: (apiBase) => ({
                apiBase,
                uiBase: `${apiBase}${uiBase}`,
                auth,
            }),
            csp: (config) => buildCsp(config as StaticCspConfig),
        })) {
            container.registerMany(AppToken.HTTP_ROUTES, { useValue: route });
        }

        container.registerMany(AppToken.UI_PAGES, {
            useValue: {
                slug,
                label,
                types,
                path,
            },
        });
    }
}

export function uiPageModule(options: UiPageModuleOptions): IModule {
    return new UiPageModule(options);
}
