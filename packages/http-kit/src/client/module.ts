/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Client as BaseClient } from 'hapic';
import { REQUEST_TIMEOUT_MS } from '../error/constants.ts';
import type { ClientOptions, IClient } from './types.ts';

export class Client extends BaseClient implements IClient {
    readonly timeoutMs: number;

    constructor(options: ClientOptions = {}) {
        const { timeoutMs, ...rest } = options;

        super(rest);

        this.timeoutMs = timeoutMs ?? REQUEST_TIMEOUT_MS;

        if (!this.getHeader('accept')) {
            this.setHeader('accept', 'application/json');
        }
    }
}
