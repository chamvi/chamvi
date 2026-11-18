/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Marks a request whose bearer the caller fixed; the authentication hook leaves it alone. */
export const FIXED_TOKEN: unique symbol = Symbol.for('chamvi.http-kit.fixedToken');
