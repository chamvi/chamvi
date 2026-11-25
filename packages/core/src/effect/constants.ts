/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Marks a tool as a side-effecting tool that must apply at most once per run. */
export const EFFECT: unique symbol = Symbol.for('chamvi.effect');

/** Key under which the effectKey/alreadyApplied hooks hang off an effect tool. */
export const EFFECT_HOOKS: unique symbol = Symbol.for('chamvi.effect.hooks');

/** The longest name of a once() value. */
export const ONCE_NAME_MAX_LENGTH = 128;
