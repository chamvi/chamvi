/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The brand of an App; `Symbol.for`, so two installed copies of the package still match. */
export const APP_BRAND: unique symbol = Symbol.for('chamvi.app') as never;

/**
 * A non-enumerable accessor of an App: a copy of its modules, for readers
 * such as `readDatabaseDescriptors()` (also of another installed copy of
 * the package, so `Symbol.for`).
 */
export const APP_MODULES: unique symbol = Symbol.for('chamvi.app.modules') as never;
