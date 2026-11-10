/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ConnectionNotConfiguredError } from '@chamvi/core';
import type { IMailClient } from './types.ts';

/** The client of an app without accounts: each call is a tool error naming the connection, the run goes on. */
export function createUnconfiguredMailClient(connection: string): IMailClient {
    const refuse = async (): Promise<never> => {
        throw new ConnectionNotConfiguredError(connection);
    };

    return {
        accounts: refuse,
        search: refuse,
        get: refuse,
        attachment: refuse,
        thread: refuse,
        close: async () => undefined,
    };
}
