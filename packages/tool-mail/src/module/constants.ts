/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const TOOL_MAIL_MODULE_NAME = 'chamvi:tool-mail';

/** A JSON array of `{ id?, address, host, port?, security?, folders?, gmail? }`, read by `toolMailModule()`. */
export const MAIL_ACCOUNTS_VARIABLE = 'CHAMVI_MAIL_ACCOUNTS';

/** The prefix of an account's credential variables: `CHAMVI_MAIL_<ID>_USER`, `..._PASSWORD`. */
export const MAIL_VARIABLE_PREFIX = 'CHAMVI_MAIL_';

/** The suffix of a variable naming a file that holds the value (a mounted Secret). */
export const FILE_VARIABLE_SUFFIX = '_FILE';
