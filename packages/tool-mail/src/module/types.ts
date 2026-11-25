/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';
import type { MailWriteAccount } from '../write-client/types.ts';

export type ToolMailModuleOptions = {
    /** Where the `CHAMVI_MAIL_*` variables are read, when the factory is called; default `process.env`. */
    env?: Env;
    /** The accounts to read (and, with `smtp`, to send from); given, `CHAMVI_MAIL_ACCOUNTS` is not read. */
    accounts?: MailWriteAccount[];
};

/** An account of `CHAMVI_MAIL_ACCOUNTS`: a password not in env may come from the store, `setup` decides. */
export type MailEnvAccount = Omit<MailWriteAccount, 'password'> & { password?: string };
