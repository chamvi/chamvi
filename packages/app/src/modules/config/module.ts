/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { systemClock } from '@chamvi/core';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { readConfig } from '../../config/module.ts';
import { readKeyring } from '../../keyring/module.ts';
import { createLogger } from '../../logger/module.ts';
import { AppToken, ModuleName } from '../../module/constants.ts';
import type { ConfigModuleOptions } from './types.ts';

/**
 * Reads the app config from the context env and registers `CONFIG`,
 * `CLOCK`, `LOGGER` and the lazy `KEYRING` (unless one is registered).
 */
export class ConfigModule implements IModule {
    readonly name: string = ModuleName.CONFIG;

    protected options: ConfigModuleOptions;

    constructor(options: ConfigModuleOptions = {}) {
        this.options = options;
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        const config = readConfig(context.env, { mode: context.mode, dev: context.dev });
        const clock = this.options.clock ?? systemClock;
        const logger = this.options.logger ?? createLogger({ level: config.logLevel, clock });

        container.register(AppToken.CONFIG, { useValue: config });
        container.register(AppToken.CLOCK, { useValue: clock });
        container.register(AppToken.LOGGER, { useValue: logger });

        // lazy: the variable is read, and must exist, only when a module resolves the keyring
        if (!container.has(AppToken.KEYRING)) {
            container.register(AppToken.KEYRING, { useFactory: () => readKeyring(context.env) });
        }
    }
}

export function configModule(options?: ConfigModuleOptions): IModule {
    return new ConfigModule(options);
}
