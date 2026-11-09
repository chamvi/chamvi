/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Decimal } from 'decimal.js';

export type Token = { kind: 'number'; text: string } |
    { kind: 'name'; text: string } |
    { kind: 'symbol'; text: '+' | '-' | '*' | '/' | '^' | '%' | '(' | ')' | ',' } |
    { kind: 'end' };

/** A value; `percent` is set on a `x%` literal so `+` and `-` can refuse it. */
export type Operand = {
    value: Decimal;
    percent: boolean;
};
