/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The validator group of a write: a field mounted for one group only is stripped from the other. */
export enum ValidatorGroup {
    CREATE = 'create',
    UPDATE = 'update',
}
