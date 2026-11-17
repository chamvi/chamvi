/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { APP_MODULES } from '../../app/constants.ts';
import type { IApp } from '../../app/types.ts';
import { descriptorOf } from './helpers.ts';
import type { DatabaseDescriptor } from './types.ts';

/**
 * The descriptors of an app's database modules, in the order of its
 * modules: read from the modules `createApp` holds, so nothing connects,
 * no lifecycle runs and neither TypeORM's drivers nor
 * `@chamvi/store-db` load. Works on an app of another installed copy of
 * `@chamvi/app` too.
 */
export function readDatabaseDescriptors(app: IApp): DatabaseDescriptor[] {
    // an App keeps its modules under a Symbol.for key, so an App of another installed copy has it too
    const modules: unknown = Reflect.get(app, APP_MODULES);

    if (!Array.isArray(modules)) {
        return [];
    }

    return modules
        .map((module) => descriptorOf(module))
        .filter((descriptor): descriptor is DatabaseDescriptor => descriptor !== undefined);
}
