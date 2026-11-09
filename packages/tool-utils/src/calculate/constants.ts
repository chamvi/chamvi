/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Decimal } from 'decimal.js';

/** Longest accepted expression, in characters. */
export const CALCULATE_MAX_LENGTH = 1000;
/** Deepest nesting of parentheses, calls, unary minus and `^` operands. */
export const CALCULATE_MAX_DEPTH = 64;
/** Largest magnitude of a `^` exponent (an integer). */
export const CALCULATE_MAX_EXPONENT = 1000;
/** Largest magnitude of any value's decimal exponent, checked after every operation. */
export const CALCULATE_MAX_MAGNITUDE = 1000;
/** Significant digits of every operation. */
export const CALCULATE_PRECISION = 40;

/** An isolated Decimal constructor: the global one stays untouched. */
export const CalculateDecimal = Decimal.clone({
    precision: CALCULATE_PRECISION,
    rounding: Decimal.ROUND_HALF_UP,
});
