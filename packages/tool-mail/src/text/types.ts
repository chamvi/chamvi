/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A mail address or an address group, structurally compatible with postal-mime's `Address`. */
export type MailAddress = {
    name?: string,
    address?: string,
    group?: MailAddress[],
};
