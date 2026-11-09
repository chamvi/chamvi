/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineContextKey, inject } from '../context/module.ts';
import type { ToolContext } from '../tool/types.ts';
import type { IClock } from './types.ts';

/** The engine's clock for injectClock(); set by the engine itself, never through provide(). */
export const CLOCK_KEY = defineContextKey<IClock>('clock');

/** The clock of the engine executing this tool (`ControllableClock` in tests); throws ContextNotProvidedError on a hand-built context. */
export function injectClock(ctx: ToolContext): IClock {
    return inject(ctx, CLOCK_KEY);
}
