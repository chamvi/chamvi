/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { IMailClient, MailAccount } from '../client/types.ts';

export type MailToolsOptions = {
    /** The accounts the tools read through a client of their own. */
    accounts?: MailAccount[];
    /** A client to use (e.g. one closed by its owner); takes precedence over `accounts`. */
    client?: IMailClient;
    /** For the client built from `accounts`. */
    clock?: IClock;
    /** For the client built from `accounts` (default `MAIL_TIMEOUT_MS`). */
    timeoutMs?: number;
};

/** An account checked, with its defaults. */
export type MailAccountNormalized = {
    id: string;
    host: string;
    port: number;
    security: 'tls' | 'starttls' | 'plain';
    user: string;
    password: string;
    address: string;
    folders?: string[];
    gmail: boolean;
};
