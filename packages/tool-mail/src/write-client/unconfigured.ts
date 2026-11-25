/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ConnectionNotConfiguredError } from '@chamvi/core';
import type { IMailWriteClient } from './types.ts';

/** The write client of an app without accounts: each call is a tool error naming the connection. */
export function createUnconfiguredMailWriteClient(connection: string): IMailWriteClient {
    const refuse = async (): Promise<never> => {
        throw new ConnectionNotConfiguredError(connection);
    };

    return {
        // nothing is ever sent or read
        configured: false,
        account: () => undefined,
        send: refuse,
        findSent: refuse,
        describe: refuse,
        trash: refuse,
        replyHeaders: refuse,
        close: async () => undefined,
    };
}
