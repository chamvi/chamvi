/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type * as TypeormAdapterModule from '@rapiq/adapter-typeorm';

let typeormAdapter: Promise<typeof TypeormAdapterModule> | undefined;

/**
 * `@rapiq/adapter-typeorm`, loaded on the first `findMany`: a process
 * that never queries a database repository never loads it.
 */
export function loadTypeormAdapter(): Promise<typeof TypeormAdapterModule> {
    typeormAdapter ??= import('@rapiq/adapter-typeorm');

    return typeormAdapter;
}
