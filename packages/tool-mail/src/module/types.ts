/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';
import type { MailAccount } from '../client/types.ts';

export type ToolMailModuleOptions = {
    /** Where the `CHAMVI_MAIL_*` variables are read, when the factory is called; default `process.env`. */
    env?: Env;
    /** The accounts to read; given, `CHAMVI_MAIL_ACCOUNTS` is not read. */
    accounts?: MailAccount[];
};
