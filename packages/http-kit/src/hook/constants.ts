/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Marks a client the hook is attached to; holds the hook ids. */
export const HOOK_SYMBOL: unique symbol = Symbol.for('chamvi.http-kit.authHook');

/** Marks a request the hook already retried after a refresh. */
export const RETRIED_SYMBOL: unique symbol = Symbol.for('chamvi.http-kit.retried');
